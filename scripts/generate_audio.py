import json
import asyncio
import os
import re
import edge_tts

# ============================================================
# 批量生成离线语音包
#   输入：data/seed.json
#   输出：data/audio/*.mp3
#   命名：q_<题号>.mp3               题目
#         q_<题号>_opt_<选项号>.mp3   选项
#         sfx_correct.mp3 / sfx_wrong.mp3 答题反馈
# 音色：含中文 -> 晓晓（温柔女声）；纯英文单词 -> Jenny（亲切女声）
# 每次运行会清空 data/audio 后全量重建，保证与题库严格一一对应。
# ============================================================

INPUT_FILE = "data/seed.json"
OUTPUT_DIR = "data/audio"
ZH_VOICE = "zh-CN-XiaoxiaoNeural"
EN_VOICE = "en-US-JennyNeural"
CONCURRENCY = 8

CJK = re.compile(r"[\u3400-\u9fff]")
LATIN = re.compile(r"[A-Za-z]")

os.makedirs(OUTPUT_DIR, exist_ok=True)
# 清空旧音频，避免改题后残留对不上的文件
for name in os.listdir(OUTPUT_DIR):
    if name.endswith(".mp3"):
        os.remove(os.path.join(OUTPUT_DIR, name))


def pick_voice(text: str) -> str:
    if CJK.search(text):
        return ZH_VOICE
    if LATIN.search(text):
        return EN_VOICE
    return ZH_VOICE  # 纯数字/符号按中文读，如 "12" 读作"十二"


async def synth(sem: asyncio.Semaphore, text: str, filename: str) -> bool:
    path = os.path.join(OUTPUT_DIR, filename)
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, pick_voice(text)).save(path)
                if os.path.getsize(path) > 0:
                    return True
            except Exception as e:
                if attempt == 2:
                    print(f"[FAIL] {filename} <- {text!r}: {e}")
                else:
                    await asyncio.sleep(1.5 * (attempt + 1))
        return False


async def main():
    data = json.load(open(INPUT_FILE, encoding="utf-8"))
    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    for qi, item in enumerate(data):
        tasks.append(synth(sem, item["q"], f"q_{qi}.mp3"))
        for oi, opt in enumerate(item["a"]):
            tasks.append(synth(sem, str(opt), f"q_{qi}_opt_{oi}.mp3"))
    tasks.append(synth(sem, "答对了，你真棒！", "sfx_correct.mp3"))
    tasks.append(synth(sem, "再想一想哦！", "sfx_wrong.mp3"))

    print(f"题库 {len(data)} 题，待生成 {len(tasks)} 个音频 ...")
    results = await asyncio.gather(*tasks)
    ok = sum(1 for r in results if r)
    print(f"完成：成功 {ok} / {len(tasks)}")


if __name__ == "__main__":
    asyncio.run(main())
