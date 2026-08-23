#!/bin/zsh
# newsnow 冒烟测试 wrapper(直连模式);代理模式加 --proxy
cd "$(dirname "$0")/.."
exec npx ts-node scripts/newsnow-smoke.ts "$@"
