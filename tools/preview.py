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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "data", "seed.json")
AUDIO = os.path.join(ROOT, "data", "audio")
PAGE = os.path.join(ROOT, "app", "web", "index.html")
PORT = int(os.environ.get("PREVIEW_PORT", "8123"))

DATA = json.load(open(SEED, encoding="utf-8"))
STATE = {"round": None, "last": -1, "stats": {"total": 0, "right": 0}}

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
      var a = player();
      try { a.pause(); } catch (e) {}
      a.src = "/audio/" + encodeURIComponent(file);
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    },
    stopAudio: function () { if (audio) { try { audio.pause(); } catch (e) {} } },
    apiToken: function () { return "preview"; },
    exitToLauncher: function () {}
  };
})();
</script>
"""


def pick_question():
    idx = random.randrange(len(DATA))
    while len(DATA) > 1 and idx == STATE["last"]:
        idx = random.randrange(len(DATA))
    STATE["last"] = idx
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
            nxt = new_round()
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
