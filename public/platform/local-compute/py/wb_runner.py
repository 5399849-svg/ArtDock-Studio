"""Run one workbench script the way `python script.py args...` would."""
from __future__ import annotations

import contextlib
import io
import json
import os
import runpy
import sys
import traceback

import wb_bridge


def run(script: str, argv_json: str, cwd: str) -> str:
    argv = json.loads(argv_json)
    out, err = io.StringIO(), io.StringIO()
    code = 0
    wb_bridge.reset()
    wb_bridge.install()
    saved_argv, saved_path, saved_cwd = sys.argv, list(sys.path), os.getcwd()
    sys.argv = [script, *argv]
    sys.path.insert(0, os.path.dirname(script))
    try:
        os.chdir(cwd)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            runpy.run_path(script, run_name='__main__')
    except SystemExit as stop:
        if stop.code is None:
            code = 0
        elif isinstance(stop.code, int):
            code = stop.code
        else:
            err.write(str(stop.code) + '\n')
            code = 1
    except BaseException:
        traceback.print_exc(file=err)
        code = 1
    finally:
        sys.argv, sys.path[:] = saved_argv, saved_path
        os.chdir(saved_cwd)
    return json.dumps({'exitCode': code, 'stdout': out.getvalue(), 'stderr': err.getvalue(), 'pending': wb_bridge.pending()}, ensure_ascii=False)
