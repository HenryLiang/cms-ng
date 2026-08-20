#!/usr/bin/env python3
"""Build a portable Agent Skills ZIP with one named root directory."""

from __future__ import annotations

import argparse
import re
import stat
import zipfile
from pathlib import Path


EXCLUDED_NAMES = {".DS_Store", "__pycache__"}
BLOCKED_NAMES = {".env", ".cms-ng-token", ".cms-ng-token-file"}


def parse_skill_name(skill_md: Path) -> str:
    content = skill_md.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        raise ValueError(f"Invalid YAML frontmatter: {skill_md}")

    name_match = re.search(r"^name:\s*([a-z0-9-]+)\s*$", match.group(1), re.MULTILINE)
    if not name_match:
        raise ValueError(f"Missing valid name in frontmatter: {skill_md}")
    return name_match.group(1)


def package_skill(skill_dir: Path, output: Path) -> None:
    skill_dir = skill_dir.resolve()
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        raise ValueError(f"SKILL.md not found: {skill_dir}")

    skill_name = parse_skill_name(skill_md)
    if skill_dir.name != skill_name:
        raise ValueError(
            f"Skill directory '{skill_dir.name}' must match frontmatter name '{skill_name}'",
        )

    files = []
    for path in sorted(skill_dir.rglob("*")):
        relative = path.relative_to(skill_dir)
        if any(part in EXCLUDED_NAMES for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed inside the package: {path}")
        if path.is_file():
            if path.name in BLOCKED_NAMES or path.suffix == ".pyc":
                raise ValueError(f"Blocked file in skill package: {path}")
            files.append(path)

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(skill_dir)
            archive_name = (Path(skill_name) / relative).as_posix()
            info = zipfile.ZipInfo(archive_name, date_time=(1980, 1, 1, 0, 0, 0))
            mode = path.stat().st_mode
            permissions = 0o755 if mode & stat.S_IXUSR else 0o644
            info.external_attr = permissions << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())

    print(f"Packaged {len(files)} files: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skill_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    package_skill(args.skill_dir, args.output)


if __name__ == "__main__":
    main()
