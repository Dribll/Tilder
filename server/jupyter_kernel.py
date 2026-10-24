import sys
import io
import os
import ast
import json
import base64
import traceback

session_globals = {
    '__name__': '__main__',
    '__doc__': None,
    '__package__': None,
}

def execute_code(code):
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = stdout_buf, stderr_buf
    result_repr = None
    error_info = None

    try:
        tree = ast.parse(code)
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last_expr = tree.body.pop()
            if tree.body:
                exec(compile(tree, '<cell>', 'exec'), session_globals)
            eval_res = eval(compile(ast.Expression(last_expr.value), '<cell>', 'eval'), session_globals)
            if eval_res is not None:
                result_repr = repr(eval_res)
        else:
            exec(compile(tree, '<cell>', 'exec'), session_globals)
    except Exception:
        error_info = traceback.format_exc()
    finally:
        sys.stdout, sys.stderr = old_stdout, old_stderr

    images = []
    if 'matplotlib' in sys.modules and 'matplotlib.pyplot' in sys.modules:
        try:
            plt = sys.modules['matplotlib.pyplot']
            if hasattr(plt, 'get_fignums'):
                for fignum in plt.get_fignums():
                    fig = plt.figure(fignum)
                    img_buf = io.BytesIO()
                    fig.savefig(img_buf, format='png', bbox_inches='tight')
                    img_buf.seek(0)
                    images.append(base64.b64encode(img_buf.read()).decode('utf-8'))
                plt.close('all')
        except Exception:
            pass

    return {
        'stdout': stdout_buf.getvalue(),
        'stderr': stderr_buf.getvalue(),
        'result': result_repr,
        'error': error_info,
        'images': images
    }

def main():
    # Signal readiness
    sys.stdout.write(json.dumps({'type': 'ready'}) + '\n')
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            msg_type = msg.get('type')
            if msg_type == 'execute':
                req_id = msg.get('id')
                code = msg.get('code', '')
                res = execute_code(code)
                res['type'] = 'execute_reply'
                res['id'] = req_id
                sys.stdout.write(json.dumps(res) + '\n')
                sys.stdout.flush()
            elif msg_type == 'restart':
                global session_globals
                session_globals = {
                    '__name__': '__main__',
                    '__doc__': None,
                    '__package__': None,
                }
                sys.stdout.write(json.dumps({'type': 'restart_reply', 'ok': True}) + '\n')
                sys.stdout.flush()
            elif msg_type == 'ping':
                sys.stdout.write(json.dumps({'type': 'pong'}) + '\n')
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({'type': 'error', 'error': str(e)}) + '\n')
            sys.stdout.flush()

if __name__ == '__main__':
    main()
