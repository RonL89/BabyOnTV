# 读取 data/seed.json，为每题生成题干与选项的离线语音；
# 反馈音 sfx_correct / sfx_wrong 单独生成。输出到 data/audio/。
# 语音对应关系：可能与题目一一对应（固定 ID），所以换题库必须重新生成整包。
# 依赖：pip install edge-tts
# 本文件假定你接受微软 Edge 线上语音服务的条款；更简便的做法是替换成你自己的 TTS。
import asyncio, json, os, shutil, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, "data", "seed.json")
OUT = os.path.join(ROOT, "data", "audio")

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "-8%"          # 放慢一点，3-6 岁孩子听起来更清楚
SEMAPHORE = asyncio.Semaphore(6)   # 并发上限，防止被待遇限流


async def synth(text, out_name):
    async with SEMAPHORE:
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
        await communicate.save(os.path.join(OUT, out_name))


def spoken_q(text):
    """把题干转成开口读的句子：把『哪个是"鸟"字？』读顺。"""
    return text


async def main():
    with open(BANK, encoding="utf-8") as f:
        bank = json.load(f)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    kept = 0
    tasks = []
    for q in bank:
        qid = q["id"]
        tasks.append(synth(spoken_q(q["q"]), f"{qid}.mp3"))
        for i, option in enumerate(q["a"]):
            tasks.append(synth(str(option), f"{qid}_opt_{i}.mp3"))
        kept += 1 + len(q["a"])
    tasks.append(synth("答对了，真棒！", "sfx_correct.mp3"))
    tasks.append(synth("没关系，再想一想", "sfx_wrong.mp3"))
    kept += 2
    await asyncio.gather(*tasks)
    print(f"生成 {kept} 个音频 -> {OUT}")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
