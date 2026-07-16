/** 极简 className 合并（无 clsx/tailwind-merge 依赖）。 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ');
}
