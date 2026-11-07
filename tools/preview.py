"""电脑端预览服务器（不装模拟器也能体验）
用法:
    python tools/preview.py            # 默认 http://127.0.0.1:8123
操作:
    ← → 切换选项      Enter/空格 确认     声音来自 data/audio 里的真实离线音频
说明:
    复用 app/web/index.html 与 data/seed.json，并用浏览器 <audio> 模拟原生播放器，
    因此界面、题库、声音与装到电视上的 APK 完全一致（仅原生外壳不同）。
"""
import json
import os
import random
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "data", "seed.json")
AUDIO = os.path.join(ROOT, "data", "audio")
PAGE = os.path.join(ROOT, "app", "web", "index.html")
PORT = int(os.environ.get("PREVIEW_PORT", "8123"))
# 模拟家长设置的休息时段（分钟），用于验证「休息中」页面
PAUSE_MINUTES = int(os.environ.get("PREVIEW_PAUSE_MINUTES", "0"))
# 模拟还有剩余观看时长（分钟），用于验证「可以去看动画啦」页面
WATCH_MINUTES = int(os.environ.get("PREVIEW_WATCH_MINUTES", "0"))
TARGET_PER_ROUND = 5        # 与 App 的 questionsPerRound 默认值一致

DATA = json.load(open(SEED, encoding="utf-8"))
STATE = {"round": None, "stats": {"total": 0, "right": 0}, "answered": 0, "correct": 0}
RECENT = deque(maxlen=30)   # 最近 30 题不重复（与 App 内 LearningEngine 一致）
RETRY = []                  # 错题队列：[题目 id, 还要隔几题]

SHIM = """
<script>
(function () {
  var audio = null;
  function player() {
    if (!audio) { audio = document.createElement("audio"); document.body.appendChild(audio); }
    return audio;
  }
  window.SOTVNative = {
    playAudio: function (file) {
      if (!file) return;
      window.__BTV_PLAYS = (window.__BTV_PLAYS || 0) + 1;
      var a = player();
      try { a.pause(); } catch (e) {}
      a.src = "/audio/" + encodeURIComponent(file);
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    },
    stopAudio: function () { if (audio) { try { audio.pause(); } catch (e) {} } },
    apiToken: function () { return "preview"; },
    openParent: function () { window.__BTV_PARENT = true; },
    exitToLauncher: function () { window.__BTV_EXITED = true; }
  };
})();
</script>
"""


def make_question(idx):
    q = DATA[idx]
    return {
        "id": "q_%d" % idx,
        "q": q["q"],
        "a": q["a"],
        "subject": q.get("subject", ""),
        "difficulty": q.get("difficulty", 2),
        "tip": q.get("tip", ""),
        "type": "single",
    }


def pick_question():
    # 错题隔 5 题重现：每出一题，队列里的等待数减 1
    for item in RETRY:
        item[1] -= 1
    due = next((item for item in RETRY if item[1] <= 0), None)
    if due:
        RETRY.remove(due)
        return make_question(int(due[0][2:]))

    candidates = [i for i in range(len(DATA)) if "q_%d" % i not in RECENT]
    if not candidates:
        RECENT.clear()
        candidates = list(range(len(DATA)))
    idx = random.choice(candidates)
    RECENT.append("q_%d" % idx)
    return make_question(idx)


def new_round():
    rnd = {"id": str(uuid.uuid4()), "nonce": str(uuid.uuid4()), "question": pick_question(),
           "target": 5, "answered": 0, "correct": 0, "mode": "practice"}
    STATE["round"] = rnd
    return rnd


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj):
        self._send(200, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            html = open(PAGE, encoding="utf-8").read()
            html = html.replace("<body>", "<body>" + SHIM, 1)
            return self._send(200, html, "text/html; charset=utf-8")
        if path.startswith("/audio/"):
            name = os.path.basename(path[len("/audio/"):])
            target = os.path.join(AUDIO, name)
            if os.path.isfile(target):
                with open(target, "rb") as f:
                    return self._send(200, f.read(), "audio/mpeg")
            return self._send(404, b"", "text/plain")
        if path == "/favicon.ico":
            return self._send(204, b"", "text/plain")
        return self._send(404, b"not found", "text/plain")

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}

        if path == "/api/quiz/start":
            if PAUSE_MINUTES > 0:
                return self._json({"paused": True, "minutesLeft": PAUSE_MINUTES})
            if WATCH_MINUTES > 0:
                return self._json({"watching": True, "status": {"remainingSeconds": WATCH_MINUTES * 60}})
            rnd = STATE.get("round") or new_round()
            return self._json(rnd)

        if path == "/api/quiz/answer":
            rnd = STATE.get("round")
            if not rnd:
                rnd = new_round()
            if body.get("roundId") != rnd["id"] or body.get("nonce") != rnd["nonce"]:
                return self._json({"error": "round_missing"})
            q = rnd["question"]
            idx = int((body.get("selections") or [0])[0])
            answer = int(DATA[int(q["id"][2:])]["k"])
            correct = idx == answer
            STATE["stats"]["total"] += 1
            STATE["stats"]["right"] += 1 if correct else 0
            if not correct and not any(item[0] == q["id"] for item in RETRY):
                RETRY.append([q["id"], 5])   # 隔 5 题再出现
            STATE["answered"] += 1
            if correct:
                STATE["correct"] += 1
            # 与 App 一致：练习模式累计答对 5 题才结束（答错继续出题，不结束这一轮）
            if STATE["correct"] >= TARGET_PER_ROUND:
                STATE["answered"] = 0
                STATE["correct"] = 0
                STATE["round"] = None
                return self._json({"correct": correct, "correctIndices": [answer],
                                   "finished": True, "passed": True})
            nxt = new_round()
            STATE["round"] = nxt
            return self._json({
                "correct": correct,
                "correctIndices": [answer],
                "finished": False,
                "next": {"id": nxt["id"], "nonce": nxt["nonce"], "question": nxt["question"],
                         "mode": "practice", "answered": 0, "correct": 0},
            })

        if path == "/api/stats":
            s = STATE["stats"]
            return self._json({"total": s["total"], "right": s["right"],
                               "accuracy": (s["right"] * 100 // s["total"]) if s["total"] else 0})
        return self._send(404, b"not found", "text/plain")


if __name__ == "__main__":
    print("预览地址: http://127.0.0.1:%d/" % PORT)
    print("题库 %d 道；音频目录: %s" % (len(DATA), AUDIO))
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
