import path from 'path';

/**
 * 从工作区目录向上查找仓库根目录中的 `.venv/bin/prompt-bridge-helper`。
 * 这样即使用户只打开了 `vscode-extension/` 子目录，扩展也仍有机会自动发现 Helper。
 */
export function buildWorkspaceExecutableCandidates(workspaceRoot: string): string[] {
  const candidates: string[] = [];
  let current = path.resolve(workspaceRoot);

  for (let depth = 0; depth < 4; depth += 1) {
    candidates.push(path.join(current, '.venv', 'bin', 'prompt-bridge-helper'));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return candidates;
}

/**
 * 在一组工作区根目录中寻找第一个可执行 Helper。
 */
export function findFirstWorkspaceHelperExecutable(
  workspaceRoots: string[],
  existsSync: (targetPath: string) => boolean,
): string | undefined {
  for (const root of workspaceRoots) {
    for (const candidate of buildWorkspaceExecutableCandidates(root)) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * 当用户把配置写成命令名而不是绝对路径时，尝试从 PATH 中解析真实可执行文件。
 */
export function resolveCommandOnPath(
  command: string,
  existsSync: (targetPath: string) => boolean,
  envPath = process.env.PATH ?? '',
): string | undefined {
  for (const entry of envPath.split(path.delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = path.join(entry, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
