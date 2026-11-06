import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties().also { props ->
    val f = rootProject.file("local.properties")
    if (f.exists()) props.load(f.inputStream())
}

// 签名信息优先级：环境变量（CI） > keystore/keystore.properties（本地）
// keystore 本身与密码都不入库（.gitignore 已忽略），CI 从 GitHub Secrets 注入。
val keystoreProps = Properties().also { props ->
    val f = rootProject.file("../../keystore/keystore.properties")
    if (f.exists()) props.load(f.inputStream())
}

fun signingValue(env: String, prop: String, fallback: String = ""): String =
    System.getenv(env)?.takeIf { it.isNotBlank() }
        ?: keystoreProps.getProperty(prop)?.takeIf { it.isNotBlank() }
        ?: fallback

val keystorePath = signingValue("KEYSTORE_PATH", "storeFile")
val hasKeystore = keystorePath.isNotBlank() && rootProject.file(keystorePath).exists()

// versionCode：CI 用 run number（10000 + N），保证只增不减；本地固定 10000。
// versionName：CI 传入 BABYTV_VERSION（1.1.<run>），本地默认 1.1.0。
val ciRun = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0
val appVersionName = System.getenv("BABYTV_VERSION")?.takeIf { it.isNotBlank() } ?: "1.1.0"

android {
    namespace = "com.babytv.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.babytv.tv"
        minSdk = 21          // Android 5.0
        targetSdk = 34
        versionCode = if (ciRun > 0) 10000 + ciRun else 10000
        versionName = appVersionName
    }

    flavorDimensions += "device"
    productFlavors {
        create("tv") {
            dimension = "device"
            applicationId = "com.babytv.tv"
        }
        create("mobile") {
            dimension = "device"
            applicationId = "com.babytv.mobile"
        }
    }

    signingConfigs {
        create("release") {
            if (hasKeystore) {
                storeFile = rootProject.file(keystorePath)
                storePassword = signingValue("KEYSTORE_PASS", "storePassword")
                keyAlias = signingValue("KEY_ALIAS", "keyAlias", "babytv")
                keyPassword = signingValue("KEY_PASS", "keyPassword")
                storeType = signingValue(
                    "KEYSTORE_TYPE", "storeType",
                    if (keystorePath.endsWith(".jks", true)) "JKS" else "PKCS12"
                )
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = false
            // 没有 keystore 时不配置签名（产物为未签名 APK）；CI 有 Secrets 时自动使用 release 签名
            if (hasKeystore) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    lint {
        abortOnError = false
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        // 音频必须明文存放，否则 assets.openFd() 无法直接播放
        noCompress += "mp3"
    }
}

dependencies {
    // 刻意零第三方依赖：包体小、Android 5.0 兼容性最好
}

// 把网页、题库、音频同步进 assets（仓库里维护 app/web、admin、data/seed.json、data/audio 四份源）
val repoRoot = rootProject.projectDir.parentFile.parentFile
val syncWebAssets by tasks.registering(Sync::class) {
    from(File(repoRoot, "app/web")) { into("web") }
    from(File(repoRoot, "admin")) { into("admin") }
    from(File(repoRoot, "data/seed.json")) { rename { "questions.json" } }
    from(File(repoRoot, "data/audio")) { into("audio") }
    from(File(repoRoot, "shared/katex")) { into("web/assets/vendor/katex") }
    from(File(repoRoot, "shared/math.js")) { into("web/assets/js") }
    into(layout.projectDirectory.dir("src/main/assets"))
}

tasks.named("preBuild") { dependsOn(syncWebAssets) }
