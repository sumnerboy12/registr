// Grows a textarea to fit its content (including wrapped lines, not just
// explicit newlines) up to a reasonable cap, beyond which it scrolls
// internally rather than taking over the whole page. Call on mount and on
// every input.
export function autoResizeTextarea(el: HTMLTextAreaElement, maxHeight: number) {
  el.style.height = 'auto';
  // box-sizing is border-box (global * rule) but scrollHeight only covers
  // content+padding, not the border — without adding it back, the set
  // height comes up a couple px short of the actual content and shows a
  // needless scrollbar.
  const borderHeight = el.offsetHeight - el.clientHeight;
  el.style.height = `${Math.min(el.scrollHeight + borderHeight, maxHeight)}px`;
}
