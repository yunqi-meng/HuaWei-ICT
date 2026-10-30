"""只读业务 API 并发探测，输出实测样本，不代表整个系统 SLA。"""
import argparse
import concurrent.futures
import json
import time
from pathlib import Path
import httpx


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://127.0.0.1:8000/api/v1/guides")
    p.add_argument("--requests", type=int, default=200)
    p.add_argument("--workers", type=int, default=50)
    p.add_argument("--output", default="../../artifacts/load-check.json")
    args = p.parse_args()
    if not 1 <= args.requests <= 5000 or not 1 <= args.workers <= 100:
        p.error("请求数应为 1～5000，并发数为 1～100")
    def request(_):
        start = time.monotonic()
        try:
            response = client.get(args.url)
            code = response.status_code
        except httpx.HTTPError:
            code = 0
        return code, (time.monotonic() - start) * 1000
    start = time.monotonic()
    with httpx.Client(timeout=20, limits=httpx.Limits(max_connections=args.workers, max_keepalive_connections=args.workers)) as client:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            results = list(pool.map(request, range(args.requests)))
    latencies = sorted(r[1] for r in results)
    report = {"url": args.url, "requests": args.requests, "workers": args.workers,
              "successful": sum(code == 200 for code, _ in results), "elapsed_seconds": time.monotonic() - start,
              "p50_ms": latencies[int(len(latencies)*.5)], "p95_ms": latencies[min(len(latencies)-1,int(len(latencies)*.95))],
              "note": "共享客户端连接池，计入 HTTP 与连接等待；仅测当前 URL，不代表模型调用或所有业务 API。"}
    path = Path(args.output).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
