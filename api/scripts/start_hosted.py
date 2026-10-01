"""Two bounded processes in one API container; retrieval stays loopback-only."""
import os,signal,subprocess,sys,time,urllib.request
from pathlib import Path

def main():
    if os.getenv('PORTFOLIO_AUTH_ENABLED')!='1':raise RuntimeError('Hosted identity is required')
    expected='http://127.0.0.1:8790'
    if os.getenv('PLOTLINE_RAG_URL')!=expected or os.getenv('PLOTLINE_AUX_RAG_URL')!=expected:
        raise RuntimeError('Only the internal sample retrieval service is configured')
    children=[]
    def stop(*_):
        for child in reversed(children):
            if child.poll() is None:child.terminate()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        children.append(subprocess.Popen([sys.executable,'-m','uvicorn','devrag.server:app','--host','127.0.0.1','--port','8790','--no-access-log']))
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if children[0].poll() is not None:raise RuntimeError('Internal retrieval failed')
            try:
                with urllib.request.urlopen(expected+'/health',timeout=1) as r:
                    if r.status==200:break
            except Exception:time.sleep(.2)
        else:raise RuntimeError('Internal retrieval not ready')
        children.append(subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8600','--workers','1','--no-access-log','--no-proxy-headers']))
        while all(child.poll() is None for child in children):time.sleep(.25)
        return 1
    finally:
        stop()
        for child in children:
            try:child.wait(timeout=8)
            except subprocess.TimeoutExpired:child.kill();child.wait()
if __name__=='__main__':raise SystemExit(main())
