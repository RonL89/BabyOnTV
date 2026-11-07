package com.babytv.tv

class GateActivity : MainActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        isActive = true
    }

    override fun onDestroy() {
        isActive = false
        super.onDestroy()
    }

    companion object {
        @Volatile
        var isActive: Boolean = false
            private set
    }
}
