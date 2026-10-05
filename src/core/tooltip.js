// 全站共享 tooltip：tooltip.show(event, html) / tooltip.move(event) / tooltip.hide()
let el;

function ensure() {
  if (!el) {
    el = document.createElement('div');
    el.className = 'tooltip';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.append(el);
  }
  return el;
}

function position(event) {
  const t = ensure();
  const pad = 14;
  let x;
  let y;
  if (event && 'clientX' in event && event.clientX !== 0) {
    x = event.clientX;
    y = event.clientY;
  } else {
    // 键盘聚焦：贴在目标元素旁
    const r = event?.target?.getBoundingClientRect?.() || { right: innerWidth / 2, top: innerHeight / 2 };
    x = r.right;
    y = r.top;
  }
  const { width, height } = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + width > innerWidth - 8) left = x - width - pad;
  if (top + height > innerHeight - 8) top = y - height - pad;
  t.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}

export const tooltip = {
  show(event, html) {
    const t = ensure();
    t.innerHTML = html;
    t.hidden = false;
    position(event);
  },
  move(event) {
    if (el && !el.hidden) position(event);
  },
  hide() {
    if (el) el.hidden = true;
  },
};

/** 便捷绑定：selection.call(bindTooltip, d => html)，同时支持鼠标与键盘焦点 */
export function bindTooltip(selection, html) {
  selection
    .attr('tabindex', 0)
    .on('pointerenter.tt focus.tt', (event, d) => tooltip.show(event, html(d)))
    .on('pointermove.tt', (event) => tooltip.move(event))
    .on('pointerleave.tt blur.tt', () => tooltip.hide());
}
