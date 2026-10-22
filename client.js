/**
 * Client half of `web-annotate`.
 *
 * Registers one right-Sidebar tab type, `web-annotate`, that hosts its own
 * sandboxed Desktop webview. It reads the visited page through
 * `<webview>.executeJavaScript()` and renders the collected element comments as
 * one Markdown message in the Session, so a click here becomes a code change
 * there.
 *
 * Why the plugin owns the guest instead of decorating the shipped Browser tab:
 * cross-origin pages are unreadable from an iframe, the shipped tab's guest is
 * a private object of that package, and its DOM would have to be guessed at.
 * The Desktop shell already exposes a lease-scoped guest bridge
 * (`window.dshDesktop.browser`) and admits `about:blank#<lease>` webviews for
 * it, so a second, purpose-built tab keeps both packages honest.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-web-annotate',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'webAnnotate';
    const TAB_KIND = 'web-annotate';
    const TAB_ID = 'dsh-plugin-web-annotate';
    /** The shipped Browser kind this plugin's extension registration takes over. */
    const BROWSER_KIND = 'browser';
    const TAKEOVER_ID = 'dsh-plugin-web-annotate/browser';
    const CSS_TAG = 'dsh-plugin-web-annotate/client.css';
    const STORAGE_PREFIX = 'dsh.web-annotate.v1';
    const AGENT_KEY = '__DSH_ANNOTATE_AGENT__';
    const MAX_MARKS = 20;
    const MAX_COMMENT = 500;
    const POLL_MS = 140;
    const WORKSPACE_FALLBACK_MS = 4000;

    /* ------------------------------------------------------------------ copy */

    const ZH = {
      'meta.title': '网页批注',
      'meta.description':
        '在内置浏览器里选中元素写评论，一键把批注和元素信息发给会话，让模型直接改对应源码。',
      'tab.title': '网页批注',
      'browser.title': '浏览器',
      'browser.guide.description': '浏览网页，点选元素即可批注并发送给会话',
      'guide.title': '网页批注',
      'guide.description': '打开网页，点选元素写评论，一次发给会话',
      'address.label': '网址',
      'address.placeholder': '输入网址，例如 http://localhost:3000',
      'address.invalid': '网址无效，只支持 http 与 https',
      'toolbar.back': '后退',
      'toolbar.forward': '前进',
      'toolbar.reload': '刷新',
      'toolbar.open': '打开',
      'toolbar.annotate': '批注模式',
      'toolbar.annotateOn': '退出批注模式',
      'toolbar.send': '发送修改',
      'start.title': '在上方输入网址开始',
      'start.hint': '内网与本机地址都可以；页面加载后打开“批注模式”，点选元素即可评论。',
      'pick.hint': '批注模式：点击元素写评论，保存后可以马上点下一个；按 Esc 退出',
      'page.hint.pick': '批注模式 · 点击元素添加批注 · Esc 退出',
      'page.hint.paused': '已选中元素 · 写完评论后自动继续 · Esc 退出',
      'composer.title': '为这个元素写批注',
      'composer.save': '添加批注',
      'composer.drag': '拖动可调整位置',
      'composer.cancel': '取消',
      'tray.title': '批注',
      'tray.empty': '还没有批注。打开批注模式，点击页面元素添加第一条。',
      'tray.clear': '清空',
      'tray.expand': '展开批注',
      'tray.collapse': '收起批注',
      'sent.title': '网页批注',
      'sent.count': '%n 条',
      'bar.label': '网页批注工具栏',
      'bar.annotating': '正在批注',
      'bar.paused': '批注已暂停',
      'bar.short': '批注',
      'bar.pausedShort': '已暂停',
      'bar.pause': '暂停点选',
      'bar.resume': '继续点选',
      'bar.hidePins': '隐藏标记',
      'bar.showPins': '显示标记',
      'bar.details': '批注明细',
      'bar.clear': '清空批注',
      'bar.send': '发送',
      'bar.exit': '退出批注模式，保留批注',
      'bar.drag': '拖动功能栏，按 Home 恢复位置',
      'drawer.title': '批注明细',
      'drawer.close': '关闭明细',
      'draft.remove': '移除批注',
      'mark.edit': '编辑',
      'mark.save': '保存',
      'mark.delete': '删除',
      'mark.count': '共 %n 条',
      'send.sending': '发送中…',
      'send.sent': '已发送到会话',
      'send.empty': '至少添加一条批注',
      'guest.acquiring': '正在准备内置浏览器…',
      'page.loading': '页面加载中…',
      'notice.foreign': '有 %n 条批注来自之前的页面，发送时会保留各自的地址。',
      'guest.failed': '内置浏览器标签创建失败',
      'guest.retry': '重试',
      'guest.unsupported':
        '当前环境不支持安全的内置浏览（仅桌面版可用）。请在桌面应用中打开本插件。',
      'error.load': '页面加载失败',
      'error.send.busy': '这个回合还在运行，已改为排队发送，请稍候',
      'error.send.writer': '另一个窗口正在写这个会话，关掉它再试',
      'error.send.notfound': '这个会话已经不存在了',
      'error.send.offline': '连接已断开，重新连上后再试',
      'error.send.cancelled': '发送被取消了，再试一次',
      'error.send.generic': '发送失败，稍后再试',
      'prompt.heading': '## 网页批注',
      'prompt.page': '页面：',
      'prompt.pageTitle': '标题：',
      'prompt.items': '条目：',
      'prompt.box': '位置',
      'prompt.comment': '批注：',
      'prompt.text': '文本：',
      'prompt.shadow': '位于 shadow DOM 内',
      'prompt.iframe': '这是 iframe 元素本身，内部元素无法直接读取',
      'prompt.tail':
        '请在本项目源码中定位上面这些元素或文案对应的实现，并按批注完成修改。若某个元素无法定位，请说明你搜索过的文件与线索。',
    };

    const EN = {
      'meta.title': 'Web Annotations',
      'meta.description':
        'Pick elements on a page in the built-in browser, comment on them, and send every comment to the session in one click.',
      'tab.title': 'Web annotate',
      'browser.title': 'Browser',
      'browser.guide.description': 'Browse the web and comment on elements straight into the session',
      'guide.title': 'Web annotate',
      'guide.description': 'Open a page, comment on elements, send them at once',
      'address.label': 'Address',
      'address.placeholder': 'Enter an address, for example http://localhost:3000',
      'address.invalid': 'Invalid address; only http and https are supported',
      'toolbar.back': 'Back',
      'toolbar.forward': 'Forward',
      'toolbar.reload': 'Reload',
      'toolbar.open': 'Open',
      'toolbar.annotate': 'Annotate mode',
      'toolbar.annotateOn': 'Leave annotate mode',
      'toolbar.send': 'Send edits',
      'start.title': 'Enter an address above to begin',
      'start.hint':
        'Local and intranet addresses work. Once the page loads, turn on Annotate mode and click an element to comment.',
      'pick.hint': 'Annotate mode: click an element to comment, then pick the next one right away; press Esc to leave',
      'page.hint.pick': 'Annotate mode · click an element to comment · Esc to leave',
      'page.hint.paused': 'Element selected · keeps going after you save · Esc to leave',
      'composer.title': 'Comment on this element',
      'composer.save': 'Add annotation',
      'composer.drag': 'Drag to move',
      'composer.cancel': 'Cancel',
      'tray.title': 'Annotations',
      'tray.empty': 'No annotations yet. Turn on Annotate mode and click an element to add the first one.',
      'tray.clear': 'Clear',
      'tray.expand': 'Expand annotations',
      'tray.collapse': 'Collapse annotations',
      'sent.title': 'Page annotations',
      'sent.count': '%n items',
      'bar.label': 'Page annotation toolbar',
      'bar.annotating': 'Annotating',
      'bar.paused': 'Paused',
      'bar.short': 'Notes',
      'bar.pausedShort': 'Paused',
      'bar.pause': 'Pause picking',
      'bar.resume': 'Resume picking',
      'bar.hidePins': 'Hide markers',
      'bar.showPins': 'Show markers',
      'bar.details': 'Annotation details',
      'bar.clear': 'Clear annotations',
      'bar.send': 'Send',
      'bar.exit': 'Leave annotate mode, keep annotations',
      'bar.drag': 'Drag the toolbar; press Home to reset',
      'drawer.title': 'Annotation details',
      'drawer.close': 'Close details',
      'draft.remove': 'Remove annotations',
      'mark.edit': 'Edit',
      'mark.save': 'Save',
      'mark.delete': 'Delete',
      'mark.count': '%n total',
      'send.sending': 'Sending…',
      'send.sent': 'Sent to the session',
      'send.empty': 'Add at least one annotation',
      'guest.acquiring': 'Preparing the built-in browser…',
      'page.loading': 'Loading the page…',
      'notice.foreign': '%n annotation(s) come from an earlier page; each keeps its own address when sent.',
      'guest.failed': 'Could not create the built-in browser tab',
      'guest.retry': 'Retry',
      'guest.unsupported':
        'This environment cannot host a safe embedded page (desktop only). Open this plugin in the desktop app.',
      'error.load': 'The page failed to load',
      'error.send.busy': 'This turn is still running; the message was queued',
      'error.send.writer': 'Another window is writing to this session; close it and retry',
      'error.send.notfound': 'This session no longer exists',
      'error.send.offline': 'Disconnected; reconnect and try again',
      'error.send.cancelled': 'The send was cancelled; try again',
      'error.send.generic': 'Could not send; try again in a moment',
      'prompt.heading': '## Page annotations',
      'prompt.page': 'Page: ',
      'prompt.pageTitle': 'Title: ',
      'prompt.items': 'Items: ',
      'prompt.box': 'Box',
      'prompt.comment': 'Comment: ',
      'prompt.text': 'Text: ',
      'prompt.shadow': 'inside a shadow root',
      'prompt.iframe': 'this is the iframe element itself; its content cannot be read',
      'prompt.tail':
        'Locate the implementation of these elements or strings in this project and apply the comments. If an element cannot be located, say which files and clues you checked.',
    };

    /* ----------------------------------------------------------------- styles */

    const CSS = `
.dshAnnotate{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit;font-size:13px}
.dshAnnotate__toolbar{display:flex;align-items:center;gap:4px;padding:5px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;min-width:0}
.dshAnnotate__icon{box-sizing:border-box;width:26px;height:26px;min-width:26px;flex:0 0 26px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;overflow:visible}
/* The glyph keeps its own square box: a flex parent must never squash it. */
.dshAnnotate__icon>svg{display:block;width:16px;height:16px;flex:none;overflow:visible}
.dshAnnotate__icon:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshAnnotate__icon:disabled{opacity:.4;cursor:default}
.dshAnnotate__icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshAnnotate__icon[data-on]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary)}
.dshAnnotate__addressForm{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:4px}
.dshAnnotate__address{box-sizing:border-box;flex:1 1 auto;min-width:0;width:100%;height:26px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.dshAnnotate__address:focus{border-color:var(--dsw-alias-brand-primary)}
.dshAnnotate__address::placeholder{color:var(--dsw-alias-label-secondary)}
.dshAnnotate__btn{height:26px;flex:none;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dshAnnotate__btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dshAnnotate__btn:disabled{opacity:.45;cursor:default}
.dshAnnotate__btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshAnnotate__btn--primary{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 36%,transparent);color:var(--dsw-alias-brand-primary);font-weight:500}
.dshAnnotate__toggle[data-on]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);color:var(--dsw-alias-brand-primary)}
.dshAnnotate__btn--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}
.dshAnnotate__count{font-variant-numeric:tabular-nums}
.dshAnnotate__viewport{position:relative;flex:1 1 auto;min-height:0;display:flex;overflow:hidden;background:var(--dsw-alias-bg-base)}
.dshAnnotate__host{position:absolute;inset:0;display:flex;min-width:0;min-height:0}
.dshAnnotate__frame{flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;border:0;display:flex;background:var(--dsw-alias-bg-base)}
.dshAnnotate__start{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;pointer-events:none}
.dshAnnotate__startTitle{font-size:14px;color:var(--dsw-alias-label-primary)}
.dshAnnotate__startHint{font-size:12px;line-height:18px;max-width:360px;color:var(--dsw-alias-label-secondary)}
.dshAnnotate__notice{position:absolute;left:0;right:0;top:0;padding:6px 10px;font-size:11px;line-height:16px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dshAnnotate__notice[data-tone="error"]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dshAnnotate__notice[data-tone="brand"]{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.dshAnnotate__noticeAction{margin-left:8px;border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0}
/* The tray floats over the page instead of taking a row below it: the page keeps
   its full height, and the panel appears only while there is something to do. */
/* ── floating command bar ────────────────────────────────────────────────────
   One control surface for the whole batch, floating inside the page viewport.
   Dark capsule, white text, one blue send button; width follows its content. */
.dshAnnotate__bar{position:absolute;z-index:6;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;height:50px;padding:7px 8px;box-sizing:border-box;width:max-content;max-width:calc(100% - 20px);border:1px solid rgba(255,255,255,.04);border-radius:15px;background:#2c2c2c;color:#f8f8f8;box-shadow:0 6px 18px rgba(0,0,0,.13),0 1px 3px rgba(0,0,0,.13);white-space:nowrap;user-select:none;touch-action:none}
.dshAnnotate__bar[data-dragged]{transform:none;left:0;bottom:auto}
.dshAnnotate__barGrip{flex:none;display:grid;place-items:center;width:28px;height:34px;padding:0;border:0;border-radius:9px;background:rgba(255,255,255,.06);color:#a5a5a5;cursor:grab;touch-action:none}
.dshAnnotate__barGrip:active{cursor:grabbing}
.dshAnnotate__barGrip:hover{color:#e5e5e5}
.dshAnnotate__barLabel{flex:none;padding:0 8px 0 5px;min-width:106px;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.dshAnnotate__barLabelShort{display:none}
.dshAnnotate__barTool{flex:none;display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:#e5e5e5;cursor:pointer;transition:background .12s,color .12s}
.dshAnnotate__barTool:hover:not(:disabled){background:rgba(255,255,255,.08)}
.dshAnnotate__barTool[data-on]{background:rgba(255,255,255,.09);color:#fff}
.dshAnnotate__barTool:disabled{color:#7c7c7c;cursor:default}
.dshAnnotate__barTool:focus-visible,.dshAnnotate__barGrip:focus-visible{outline:2px solid #9ec4ff;outline-offset:1px}
.dshAnnotate__barSend{flex:none;height:34px;min-width:55px;margin-left:4px;padding:0 13px;border:0;border-radius:10px;background:#367ef8;color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background .12s,transform .12s}
.dshAnnotate__barSend:hover:not(:disabled){background:#4b8eff}
.dshAnnotate__barSend:active:not(:disabled){transform:scale(.97)}
.dshAnnotate__barSend:disabled{background:#555;color:#aaa;cursor:default}
.dshAnnotate__barSend[data-sending]{background:#356ac0;color:#dbeaff;min-width:78px}
.dshAnnotate__barSend:focus-visible{outline:2px solid #afcfff;outline-offset:2px}
/* The error rides just above the bar, so it never hides the page. */
.dshAnnotate__barError{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:6;max-width:calc(100% - 24px);padding:6px 12px;border-radius:9px;background:rgba(180,35,24,.96);color:#fff;font-size:12px;line-height:17px;box-shadow:0 6px 18px rgba(0,0,0,.2)}
/* The drawer opens next to the bar: centred under it normally, following the
   bar's left edge once the bar was dragged. [data-anchored] switches off the
   centring transform, because an inline left offset and translateX(-50%) would
   otherwise stack and push the box off the left edge. */
.dshAnnotate__drawer{position:absolute;z-index:5;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;max-height:min(52vh,420px);box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:15px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 8px 30px rgba(23,36,60,.15),0 1px 4px rgba(23,36,60,.06);overflow:hidden}
.dshAnnotate__drawer[data-anchored]{transform:none;left:0}
.dshAnnotate__drawerHead{flex:none;display:flex;align-items:center;gap:6px;min-height:46px;padding:0 10px 0 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshAnnotate__drawerTitle{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshAnnotate__drawerCount{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dshAnnotate__drawerSpacer{flex:1 1 auto;min-width:0}
.dshAnnotate__drawerBody{flex:1 1 auto;min-height:0;overflow:auto;padding:0 0 4px}
.dshAnnotate__drawerBtn{flex:none;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dshAnnotate__drawerBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dshAnnotate__drawerBtn:disabled{opacity:.45;cursor:default}
.dshAnnotate__drawerBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
@media (max-width:520px){
  /* Narrow: drop to the short label and tighten spacing rather than shrink text. */
  .dshAnnotate__barLabel{min-width:0;padding:0 4px 0 4px;font-size:13px}
  .dshAnnotate__barLabelLong{display:none}
  .dshAnnotate__barLabelShort{display:inline}
  .dshAnnotate__bar{gap:2px;padding:6px}
  .dshAnnotate__barTool{width:30px}
  .dshAnnotate__barSend{min-width:48px;padding:0 10px;font-size:13px}
}
@media (prefers-reduced-motion:reduce){
  .dshAnnotate__bar,.dshAnnotate__drawer{transition:none;animation:none}
}
.dshAnnotate__tray{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;flex-direction:column;min-height:0;max-height:70%;border-top:.5px solid var(--dsw-alias-border-l2);border-radius:10px 10px 0 0;background:var(--dsw-alias-bg-layer-1);box-shadow:0 -8px 28px rgba(16,24,40,.14)}
.dshAnnotate__trayHead{flex:none;display:flex;align-items:center;gap:6px;padding:4px 6px 4px 4px;min-width:0}
.dshAnnotate__trayToggle{display:inline-flex;align-items:center;gap:4px;min-width:0;height:24px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dshAnnotate__trayToggle:hover{background:var(--dsw-alias-bg-layer-2)}
.dshAnnotate__trayToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshAnnotate__traySpacer{flex:1 1 auto;min-width:0}
/* Inside a floating panel the body owns its own padding and scroller. */
.dshAnnotate__trayBody{flex:1 1 auto;min-height:0;overflow:auto;padding:0 0 6px}
.dshAnnotate__empty{padding:14px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
/* A composer is a row: leading handle, field, action. */
.dshAnnotate__composer{display:flex;align-items:center;gap:6px}
/* Editing an existing annotation stays a stacked block inside the tray row. */
.dshAnnotate__rowActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
/* The comment box is a single pill: a hairline capsule with a leading sliders
   glyph, the field in the middle, and a filled circular send button at the end.
   It sits above the page on a soft shadow rather than a drawn border. */
.dshAnnotate__composer--float{position:absolute;z-index:4;box-sizing:border-box;display:flex;align-items:center;gap:6px;width:340px;max-width:calc(100% - 16px);padding:6px 6px 6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 6px rgba(16,24,40,.06),0 10px 28px rgba(16,24,40,.14);cursor:text}
/* The leading glyph is the drag handle: grabbing it moves the popover. */
.dshAnnotate__composerGrip{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;color:var(--dsw-alias-label-secondary);cursor:grab;user-select:none;transition:background .12s ease,color .12s ease}
.dshAnnotate__composerGrip:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshAnnotate__composerGrip:active{cursor:grabbing}
.dshAnnotate__gripDots{display:block;flex:none}
/* The field has no box of its own: the pill is the box. */
.dshAnnotate__composerRow{flex:1 1 auto;display:flex;align-items:center;min-width:0;gap:6px}
.dshAnnotate__textarea{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;height:30px;min-height:30px;max-height:120px;padding:5px 2px;border:0;border-radius:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;resize:none;outline:none;overflow-y:auto}
.dshAnnotate__textarea::placeholder{color:var(--dsw-alias-label-secondary)}
/* Filled circle, dark ink: the one clear action in the pill. */
.dshAnnotate__confirm{box-sizing:border-box;flex:0 0 auto;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:#1f2126;color:#fff;cursor:pointer;transition:background .12s ease,transform .12s ease,opacity .12s ease}
.dshAnnotate__confirm:hover:not(:disabled){background:#0f1115}
.dshAnnotate__confirm:active:not(:disabled){transform:scale(.96)}
.dshAnnotate__confirm:disabled{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:default}
.dshAnnotate__confirm:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshAnnotate__confirm>svg{display:block;width:16px;height:16px;flex:none}
.dshAnnotate__composerTarget{display:flex;align-items:center;gap:6px;min-width:0}
.dshAnnotate__composerTitle{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}
.dshAnnotate__selector{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-primary)}
.dshAnnotate__meta{font-size:11px;color:var(--dsw-alias-label-secondary)}
/* Editing one annotation in place. The field is a soft outlined box on the card
   surface, and the only action is a filled primary "save" — cancelling is Esc or
   clicking away, so the row does not sprout a second competing button. */
.dshAnnotate__edit{display:flex;flex-direction:column;gap:8px;padding-top:2px}
.dshAnnotate__editBox{box-sizing:border-box;width:100%;min-height:56px;max-height:140px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:20px;outline:none;transition:border-color .12s,box-shadow .12s}
.dshAnnotate__editBox:hover{border-color:#cfd8e3}
.dshAnnotate__editBox:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dshAnnotate__editActions{display:flex;align-items:center;gap:8px}
.dshAnnotate__editSave{height:30px;padding:0 14px;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background .12s,transform .12s}
.dshAnnotate__editSave:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,#000)}
.dshAnnotate__editSave:active:not(:disabled){transform:scale(.97)}
.dshAnnotate__editSave:disabled{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:default}
.dshAnnotate__editSave:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshAnnotate__rowActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
/* One annotation row: number, then the element label over the comment, with the
   edit/delete pair pushed to the trailing edge. */
.dshAnnotate__mark{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshAnnotate__mark:last-child{border-bottom:0}
.dshAnnotate__badge{flex:none;width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:500;line-height:22px;text-align:center;font-variant-numeric:tabular-nums}
.dshAnnotate__markBody{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}
/* The element label is a locator, so it reads as muted metadata; the comment is
   the content and carries the primary ink at a comfortable size. */
.dshAnnotate__markBody .dshAnnotate__selector{font-family:inherit;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshAnnotate__markComment{font-size:14px;line-height:21px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.dshAnnotate__markActions{flex:none;display:flex;align-items:center;gap:6px;padding-top:1px}
.dshAnnotate__miniIcon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:#8a97a8;cursor:pointer;transition:background .12s,color .12s}
.dshAnnotate__mark:last-child{border-bottom:0}
.dshAnnotate__mark[data-status="sent"]{opacity:.62}
.dshAnnotate__miniIcon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshAnnotate__miniIcon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshAnnotate__status{flex:none;font-size:11px;line-height:18px;padding:0 8px;color:var(--dsw-alias-label-secondary)}
.dshAnnotate__status[data-tone="error"]{color:var(--dsw-alias-state-error-primary);padding-bottom:6px}
.dshAnnotate__status[data-tone="success"]{color:var(--dsw-alias-state-success-primary);padding-bottom:6px}
/* The transcript card: a compact chip that expands into the item list. It sits
   inline in the user message, so it must not stretch to full width. */
.dshAnnotate__sent{display:inline-block;max-width:100%;margin:2px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;font-size:12.5px;line-height:18px;vertical-align:top}
.dshAnnotate__sentHead{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:6px 9px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}
.dshAnnotate__sentHead:hover{background:var(--dsw-alias-bg-layer-2)}
.dshAnnotate__sentHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshAnnotate__sentIcon{flex:none;color:var(--dsw-alias-brand-primary);font-size:12px;line-height:1}
.dshAnnotate__sentTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.dshAnnotate__sentCount{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dshAnnotate__sentChevron{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary)}
.dshAnnotate__sentPreview{max-width:420px;padding:0 9px 7px 26px;color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshAnnotate__sentBody{border-top:1px solid var(--dsw-alias-border-l1);padding:2px 0}
.dshAnnotate__sentRow{display:flex;gap:8px;padding:6px 9px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshAnnotate__sentRow:last-child{border-bottom:0}
.dshAnnotate__sentNum{flex:none;width:16px;height:16px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);font-size:10.5px;font-weight:600;line-height:16px;text-align:center}
.dshAnnotate__sentRowBody{min-width:0;flex:1 1 auto}
.dshAnnotate__sentComment{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dshAnnotate__sentQuote{margin-top:1px;color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshAnnotate__sentMeta{margin-top:1px;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshAnnotate__sentFoot{padding:5px 9px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

    /** Register the package stylesheet once; the disposer removes the tag. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {};
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']') !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-web-annotate';
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    /* -------------------------------------------------------------- page agent */

    /**
     * The page-side agent, serialized into the guest by `executeJavaScript`.
     *
     * It must stay self-contained: it runs in the visited page's world, with no
     * access to this module. It owns the Shadow-DOM overlay that page CSS cannot
     * reach, the capture-phase picker, and the numbered pins that follow the
     * elements a comment already points at.
     */
          function pageAgent() {
            var KEY = '__DSH_ANNOTATE_AGENT__';
            var ATTR = 'data-dsh-annotate-host';
            var existing = window[KEY];
            if (existing) {
              try {
                existing.bind();
                return 'ready';
              } catch (error) {
                return 'failed';
              }
            }

            // `mode` stays on until the user turns it off; `pick` is whether the
            // page is currently accepting a click. Selecting an element pauses
            // `pick` only, so the next annotation needs no extra toolbar trip.
            var state = { mode: false, pick: false, pending: null, marks: [], outside: false, showPins: true };
            var host = null;
            var shadow = null;
            var box = null;
            var tag = null;
            var pins = null;
            var hint = null;

            // Every style is written through CSSOM (`cssText` / properties), never a
            // `<style>` element: a page with a strict `style-src` CSP blocks inline
            // sheets, while style-property writes are allowed.
            var BOX_CSS =
              'position:fixed;pointer-events:none;border:1.5px solid #2f6fed;background:rgba(47,111,237,.12);' +
              'border-radius:2px;box-sizing:border-box;display:none;z-index:2147483646';
            var TAG_CSS =
              'position:fixed;pointer-events:none;background:#2f6fed;color:#fff;' +
              'font:500 11px/16px system-ui,-apple-system,Segoe UI,sans-serif;padding:2px 6px;border-radius:4px;' +
              'max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:none;' +
              'box-shadow:0 1px 4px rgba(0,0,0,.25);z-index:2147483647';
            var PIN_CSS =
              'position:fixed;pointer-events:none;transform:translate(-50%,-50%);background:#2f6fed;color:#fff;' +
              'font:600 11px/16px system-ui,-apple-system,Segoe UI,sans-serif;min-width:16px;height:16px;' +
              'border-radius:8px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);padding:0 4px;box-sizing:border-box;' +
              'z-index:2147483647';
            var RING_CSS =
              'position:fixed;pointer-events:none;border:1.5px dashed #2f6fed;border-radius:2px;box-sizing:border-box;' +
              'background:rgba(47,111,237,.05);z-index:2147483646';
            var HINT_CSS =
              'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:none;' +
              'background:rgba(17,24,39,.92);color:#fff;font:500 12px/18px system-ui,-apple-system,Segoe UI,sans-serif;' +
              'padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.28);white-space:nowrap;' +
              'z-index:2147483647';

            // The app supplies the hint copy, so the page never shows a
            // language the user did not choose.
            var copy = { pick: '点击元素添加批注 · Esc 退出', paused: '已选中元素 · 写完评论后自动继续 · Esc 退出' };

            function ensureHost() {
              if (host !== null && host.isConnected) return;
              if (host === null) {
                host = document.createElement('div');
                host.setAttribute(ATTR, '');
                host.style.cssText =
                  'all:initial;position:fixed;inset:0;display:block;pointer-events:none;z-index:2147483646;';
                shadow = host.attachShadow({ mode: 'open' });
                box = document.createElement('div');
                box.style.cssText = BOX_CSS;
                shadow.appendChild(box);
                pins = document.createElement('div');
                pins.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
                shadow.appendChild(pins);
                tag = document.createElement('div');
                tag.style.cssText = TAG_CSS;
                shadow.appendChild(tag);
                hint = document.createElement('div');
                hint.style.cssText = HINT_CSS;
                hint.textContent = copy.pick;
                hint.style.display = 'none';
                shadow.appendChild(hint);
              }
              (document.body || document.documentElement).appendChild(host);
            }

            function escapeName(value) {
              if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
              return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
            }

            function unique(selector) {
              try {
                return document.querySelectorAll(selector).length === 1;
              } catch (error) {
                return false;
              }
            }

            /**
             * The identifying attributes, as one selector.
             *
             * Returns `''` when no attribute singles the element out; the caller
             * then falls back to the positional chain.
             */
            function handleFor(element) {
              var root = element.getRootNode ? element.getRootNode() : document;
              if (root !== document) return '';
              if (element.id) {
                var byId = '#' + escapeName(element.id);
                if (unique(byId)) return byId;
              }
              var attributes = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'name', 'aria-label'];
              for (var index = 0; index < attributes.length; index += 1) {
                var attribute = attributes[index];
                var value = element.getAttribute(attribute);
                if (value === null || value === '' || value.length > 80) continue;
                var candidate =
                  element.tagName.toLowerCase() + '[' + attribute + '="' + value.replace(/"/g, '\\"') + '"]';
                if (unique(candidate)) return candidate;
              }
              return '';
            }

            /**
             * The full positional path from `body`.
             *
             * This is the ambiguity signal: cards on a page repeat the same leaf
             * markup, so five different `div:nth-of-type(2)` elements are only
             * distinguishable by the chain above them. It is a browser locator,
             * never a source path.
             */
            function domPathFor(element) {
              var parts = [];
              var node = element;
              var depth = 0;
              while (node !== null && node.nodeType === 1 && depth < 12) {
                if (node === document.documentElement) {
                  parts.unshift('html');
                  break;
                }
                if (node === document.body) {
                  parts.unshift('body');
                  break;
                }
                var step = node.tagName.toLowerCase();
                var position = 1;
                var sibling = node;
                while ((sibling = sibling.previousElementSibling) !== null) {
                  if (sibling.tagName === node.tagName) position += 1;
                }
                step += ':nth-of-type(' + position + ')';
                parts.unshift(step);
                node = node.parentElement;
                depth += 1;
              }
              return parts.join(' > ');
            }

            function selectorFor(element) {
              var root = element.getRootNode ? element.getRootNode() : document;
              if (root !== document) return { selector: '', unique: false };
              var handle = handleFor(element);
              if (handle !== '') return { selector: handle, unique: true, handle: handle };
              var composed = domPathFor(element);
              return { selector: composed, unique: composed !== '' && unique(composed), handle: '' };
            }

            function collapse(value, limit) {
              var text = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
              return text.length > limit ? text.slice(0, limit) + '…' : text;
            }

            function describe(element) {
              var rect = element.getBoundingClientRect();
              var found = selectorFor(element);
              var root = element.getRootNode ? element.getRootNode() : document;
              var html = '';
              try {
                html = element.outerHTML || '';
              } catch (error) {
                html = '';
              }
              return {
                selector: found.selector,
                // The stable handle (`#id`, `[data-testid=…]`) when one exists,
                // kept separately from the fallback path below.
                stableHandle: found.handle || '',
                // Always the positional chain, so repeated leaves stay apart even
                // when the selector above is a handle.
                domPath: root === document ? domPathFor(element) : '',
                unique: found.unique,
                shadow: root !== document,
                frame: element.tagName.toLowerCase() === 'iframe',
                tag: element.tagName.toLowerCase(),
                role: element.getAttribute('role') || '',
                label: collapse(element.getAttribute('aria-label'), 120),
                text: collapse(element.innerText || element.textContent, 200),
                html: html.length > 700 ? html.slice(0, 700) + '…' : html,
                rect: {
                  x: Math.round(rect.left),
                  y: Math.round(rect.top),
                  w: Math.round(rect.width),
                  h: Math.round(rect.height),
                },
                viewport: { w: window.innerWidth, h: window.innerHeight },
                url: location.href,
                title: document.title,
              };
            }

            function targetOf(event) {
              var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
              var node = path.length > 0 ? path[0] : event.target;
              if (node === null || node === undefined) return null;
              if (node.nodeType === 3) node = node.parentElement;
              if (node === null || node === undefined || node.nodeType !== 1) return null;
              if (node === host || (host !== null && host.contains(node))) return null;
              return node;
            }

            function hideBox() {
              if (box !== null) box.style.display = 'none';
              if (tag !== null) tag.style.display = 'none';
            }

            function showBox(element) {
              if (box === null) return;
              var rect = element.getBoundingClientRect();
              box.style.display = 'block';
              box.style.left = rect.left + 'px';
              box.style.top = rect.top + 'px';
              box.style.width = rect.width + 'px';
              box.style.height = rect.height + 'px';
              tag.style.display = 'block';
              tag.textContent = '<' + element.tagName.toLowerCase() + '> ' + collapse(element.innerText || element.textContent, 60);
              var top = rect.top >= 26 ? rect.top - 24 : rect.bottom + 4;
              var left = Math.max(2, Math.min(rect.left, window.innerWidth - 210));
              tag.style.top = top + 'px';
              tag.style.left = left + 'px';
            }

            function onMove(event) {
              if (!state.pick) return;
              var element = targetOf(event);
              if (element === null) {
                hideBox();
                return;
              }
              showBox(element);
            }

            function detach() {
              window.removeEventListener('mousemove', onMove, true);
              window.removeEventListener('click', onClick, true);
              window.removeEventListener('keydown', onKey, true);
              try {
                document.documentElement.style.cursor = '';
              } catch (error) {
                /* ignore */
              }
              hideBox();
            }

            /** One hint line that always says what the next click will do. */
            function updateHint() {
              if (hint === null) return;
              if (!state.mode) {
                hint.style.display = 'none';
                return;
              }
              hint.textContent = state.pick ? copy.pick : copy.paused;
              hint.style.display = 'block';
            }

            /** Attach or release the capture listeners for the current picking state. */
            function applyPick() {
              if (state.pick && state.mode) {
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('click', onClick, true);
                window.addEventListener('keydown', onKey, true);
                try {
                  document.documentElement.style.cursor = 'crosshair';
                } catch (error) {
                  /* ignore */
                }
              } else {
                detach();
              }
              updateHint();
            }

            function onClick(event) {
              if (!state.pick) return;
              var element = targetOf(event);
              if (element === null) return;
              event.preventDefault();
              event.stopPropagation();
              if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
              state.pending = describe(element);
              // Pause collecting until the comment is written; the mode stays on.
              state.pick = false;
              // Route through applyPick so the hint says the mode is still on.
              applyPick();
            }

            function onKey(event) {
              if (!state.mode) return;
              if (event.key !== 'Escape') return;
              // Esc is the one gesture that leaves the mode, so a user can get
              // their normal cursor back without hunting for the toolbar.
              state.mode = false;
              state.pick = false;
              state.pending = null;
              applyPick();
            }

            function renderMarks() {
              if (pins === null) return;
              while (pins.firstChild !== null) pins.removeChild(pins.firstChild);
              // Hidden markers draw nothing at all; the annotations stay in
              // `state.marks`, so showing them again restores the same pins.
              if (state.showPins === false) return;
              for (var index = 0; index < state.marks.length; index += 1) {
                var mark = state.marks[index];
                if (mark === null || typeof mark !== 'object') continue;
                if (typeof mark.selector !== 'string' || mark.selector === '') continue;
                var element = null;
                try {
                  element = document.querySelector(mark.selector);
                } catch (error) {
                  element = null;
                }
                if (element === null) continue;
                var rect = element.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                var ring = document.createElement('div');
                ring.style.cssText = RING_CSS;
                ring.style.left = rect.left + 'px';
                ring.style.top = rect.top + 'px';
                ring.style.width = rect.width + 'px';
                ring.style.height = rect.height + 'px';
                pins.appendChild(ring);
                var pin = document.createElement('div');
                pin.style.cssText = PIN_CSS;
                pin.textContent = String(mark.n);
                pin.style.left = Math.max(9, rect.left) + 'px';
                pin.style.top = Math.max(9, rect.top) + 'px';
                pins.appendChild(pin);
              }
            }

            function bind() {
              ensureHost();
              renderMarks();
              // A click while paused (comment box open) is reported to the app,
              // which decides whether it dismisses the box.
              window.addEventListener('click', onPausedClick, true);
              return true;
            }

            /**
             * Turn the whole mode on or off. Turning it on starts picking;
             * turning it off drops any paused state and the pending selection.
             */
            function setPickMode(on, hintCopy) {
              ensureHost();
              if (hintCopy !== null && typeof hintCopy === 'object') {
                if (typeof hintCopy.pick === 'string') copy.pick = hintCopy.pick;
                if (typeof hintCopy.paused === 'string') copy.paused = hintCopy.paused;
              }
              state.mode = on === true;
              state.pick = state.mode;
              if (!state.mode) state.pending = null;
              applyPick();
              return state.pick;
            }

            /**
             * Resume or pause collecting inside an active mode.
             *
             * `resume()` runs after a comment is saved or cancelled, so the next
             * element can be picked immediately. `pause()` is used while the
             * comment box is open in the app, so a stray page click cannot
             * replace the element being described.
             */
            function resume() {
              if (!state.mode) return false;
              state.pick = true;
              applyPick();
              return true;
            }

            function pause() {
              state.pick = false;
              applyPick();
              return state.mode;
            }

            /**
             * While paused, a click on the page counts as "outside the comment
             * box": the app drains this flag and decides whether to dismiss. The
             * page never dismisses on its own — the app knows whether the comment
             * has text, and text must not be thrown away by a stray click.
             */
            function onPausedClick(event) {
              if (!state.mode || state.pick) return;
              // The overlay itself never receives clicks, but the app's own UI
              // could be nested in the page in future; ignore anything marked.
              var target = targetOf(event);
              if (target !== null && target.hasAttribute && target.hasAttribute(ATTR)) return;
              state.outside = true;
            }

            function drainOutside() {
              var value = state.outside === true;
              state.outside = false;
              return value;
            }

            function status() {
              return { mode: state.mode, pick: state.pick, pending: state.pending !== null };
            }

            function drain() {
              var selection = state.pending;
              state.pending = null;
              // `mode` travels with the result so the app learns when the page
              // itself ended the mode (Esc) instead of polling a second call.
              return { selection: selection, mode: state.mode, pick: state.pick };
            }

            function setMarks(list) {
              state.marks = Array.isArray(list) ? list : [];
              ensureHost();
              renderMarks();
              return state.marks.length;
            }

            /**
             * Show or hide the numbered pins and rings.
             *
             * Visibility is its own flag: hiding the markers must not delete the
             * annotations, change their numbering, or affect sending. `renderMarks`
             * reads the flag, so scroll, resize and re-injection all respect it.
             */
            function setPinsVisible(on) {
              state.showPins = on === true;
              ensureHost();
              renderMarks();
              return state.showPins;
            }

            function clearMarks() {
              state.marks = [];
              renderMarks();
            }

            window.addEventListener('scroll', renderMarks, true);
            window.addEventListener('resize', renderMarks);

            window[KEY] = {
              bind: bind,
              setPickMode: setPickMode,
              resume: resume,
              pause: pause,
              status: status,
              drain: drain,
              drainOutside: drainOutside,
              setMarks: setMarks,
              setPinsVisible: setPinsVisible,
              clearMarks: clearMarks,
              ping: function () {
                return 'ok';
              },
            };

            bind();
            return 'ready';
          }
    /* ---------------------------------------------------------------- helpers */

    const AGENT_BOOT = '(' + String(pageAgent) + ')()';

    function agentCall(method, argument, extra) {
      const args = [];
      if (argument !== undefined) args.push(JSON.stringify(argument));
      if (extra !== undefined) args.push(JSON.stringify(extra));
      return 'window.' + AGENT_KEY + ' && window.' + AGENT_KEY + '.' + method + '(' + args.join(', ') + ')';
    }

    function normalizeUrl(value) {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (raw === '') return '';
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
      let candidate = raw;
      if (!hasScheme) {
        const local = /^localhost([:/]|$)/i.test(raw) || /^\d{1,3}(\.\d{1,3}){3}([:/]|$)/.test(raw) || /^\[[0-9a-fA-F:]+\]([:/]|$)/.test(raw);
        candidate = (local ? 'http://' : 'https://') + raw;
      }
      try {
        const url = new URL(candidate);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        if (url.username !== '' || url.password !== '') return '';
        return url.href;
      } catch (error) {
        return '';
      }
    }

    function readStoredUrl(sessionId, tabId) {
      try {
        const value = globalThis.localStorage?.getItem(STORAGE_PREFIX + '.' + sessionId + '.' + tabId);
        return typeof value === 'string' ? value : '';
      } catch (error) {
        return '';
      }
    }

    function writeStoredUrl(sessionId, tabId, url) {
      try {
        if (typeof url === 'string' && url !== '' && url.startsWith('http')) {
          globalThis.localStorage?.setItem(STORAGE_PREFIX + '.' + sessionId + '.' + tabId, url);
        }
      } catch (error) {
        /* storage is best-effort */
      }
    }

    function workspaceKeyOf(snapshot, sessionId) {
      if (snapshot === undefined || snapshot === null) return undefined;
      if (snapshot.phase !== 'ready') return undefined;
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const match = items.find(
        (item) => Array.isArray(item.sessionIds) && item.sessionIds.some((id) => id === sessionId),
      );
      return match === undefined ? 'session:' + String(sessionId) : 'cwd:' + String(match.path);
    }

    function syncMarksToPage(element, marks, showPins) {
      if (element === null || element === undefined) return;
      const payload = marks
        .filter((mark) => typeof mark.selector === 'string' && mark.selector !== '')
        .map((mark) => ({ n: mark.n, selector: mark.selector }));
      try {
        // Visibility travels with the marks so a navigation or re-injection
        // lands in the state the user chose, rather than showing them again.
        element
          .executeJavaScript(agentCall('setMarks', payload), false)
          .then(() => element.executeJavaScript(agentCall('setPinsVisible', showPins !== false), false))
          .catch(() => {});
      } catch (error) {
        /* the guest navigated away */
      }
    }

    function isChinese(locale) {
      return locale === 'zh';
    }

    /**
     * Render annotations as a message for the model.
     *
     * Two shapes, because the two audiences differ:
     *
     *  * `brief` (default) keeps only what locates source code: the comment, the
     *    element's own identifier, its visible text, and the order. Coordinates
     *    and the HTML block are dropped — they describe a rendered box, not a
     *    file, and they dominated the message.
     *  * `full` keeps the original detail, for the cases where the element is
     *    anonymous and the markup is the only clue.
     *
     * Both drop the `body > main:nth-of-type(1) > …` chain when the element has
     * a stable handle, and shorten it to the last two steps otherwise.
     */
    /* ------------------------------------------------------- annotation bundle */

    /**
     * Marker that opens the annotation block inside a user message.
     *
     * The submitted text IS the model's context: the annotations must stay
     * readable to the model, so they remain ordinary Markdown in the message.
     * The Client half recognizes this block and renders it as a collapsible
     * card. The Markdown inside is the only copy — collapsing the card hides
     * nothing from the model, and nothing is duplicated on submit.
     */
    const BUNDLE_OPEN = '<!--dsh-annotations:';
    const BUNDLE_CLOSE = '-->';
    /**
     * Closing marker. A bundle written from now on ends here, so anything the
     * user appends afterwards (their own `## heading` or `- list`) is outside
     * the block by construction rather than by guessing from shape. Messages
     * written before this marker existed have none, and fall back to the
     * structural rule in `bundleBlockEnd`.
     */
    const BUNDLE_END = '<!--/dsh-annotations-->';

    /** Stable per-submission identity, so a re-render keeps the same keys. */
    function newBundleId() {
      return Math.random().toString(36).slice(2, 10);
    }

    /**
     * Build the structured bundle for one batch.
     *
     * Only measured fields are included; a missing value is omitted rather than
     * invented. `selectorCandidates` holds every handle the page agent produced,
     * because a bare `div:nth-of-type(2)` repeats across cards — the candidates
     * plus the quoted text are what disambiguate.
     */
    function buildBundle(pageUrl, pageTitle, marks) {
      const items = marks.map((mark, index) => {
        const item = {
          id: String(mark.id ?? 'a' + String(index + 1)),
          index: index + 1,
          comment: String(mark.comment ?? ''),
        };
        const selectedText = typeof mark.text === 'string' ? mark.text.trim() : '';
        if (selectedText !== '') item.selectedText = selectedText;
        const candidates = [];
        if (typeof mark.selector === 'string' && mark.selector !== '') candidates.push(mark.selector);
        if (typeof mark.stableHandle === 'string' && mark.stableHandle !== '') candidates.unshift(mark.stableHandle);
        if (candidates.length > 0) item.selectorCandidates = [...new Set(candidates)];
        if (typeof mark.domPath === 'string' && mark.domPath !== '') item.domPath = mark.domPath;
        if (typeof mark.tag === 'string' && mark.tag !== '') item.tag = mark.tag;
        if (typeof mark.label === 'string' && mark.label !== '') item.label = mark.label;
        if (mark.rect !== null && typeof mark.rect === 'object') item.rect = mark.rect;
        if (mark.viewport !== null && typeof mark.viewport === 'object') item.viewport = mark.viewport;
        if (mark.shadow === true) item.inShadowRoot = true;
        if (mark.frame === true) item.isFrame = true;
        if (typeof mark.sourceHint === 'string' && mark.sourceHint !== '') item.sourceHint = mark.sourceHint;
        return item;
      });
      return {
        version: 1,
        bundleId: newBundleId(),
        page: { url: String(pageUrl ?? ''), title: String(pageTitle ?? '') },
        items,
      };
    }

    /** Collapse one value to a single bounded line. */
    function inline(value, limit) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? text.slice(0, limit) + '…' : text;
    }

    /**
     * Render the bundle as the model-facing block.
     *
     * The labels keep three things apart that the model must not conflate: the
     * user's instruction, the quoted page text, and the selector — a browser
     * locator, not a source path.
     */
    /**
     * Render the bundle as the model-facing block.
     *
     * The labels keep three things apart that the model must not conflate: the
     * user's instruction, the quoted page text, and the selector — a browser
     * locator, not a source path.
     *
     * The heading carries a short summary; the authoritative `用户批注意见`
     * field carries the comment **verbatim**: no truncation and no whitespace
     * folding, because the input allows 500 characters across several lines and
     * the model must receive every one of them.
     */
    function renderBundle(bundle, zh) {
      const lines = [];
      lines.push(
        BUNDLE_OPEN + JSON.stringify({ version: bundle.version, bundleId: bundle.bundleId }) + BUNDLE_CLOSE,
      );
      lines.push(zh ? '## 网页批注' : '## Page annotations');
      if (bundle.page.title !== '') lines.push((zh ? '页面标题：' : 'Page title: ') + inline(bundle.page.title, 120));
      if (bundle.page.url !== '') lines.push((zh ? '页面地址：' : 'Page URL: ') + bundle.page.url);
      lines.push((zh ? '条目数：' : 'Items: ') + String(bundle.items.length));
      lines.push('');
      bundle.items.forEach((item) => {
        lines.push(
          '### ' + String(item.index) + '. ' + (inline(item.comment, 120) || (zh ? '(无意见)' : '(no comment)')),
        );
        // The complete comment, fenced so blank lines and Markdown inside it
        // cannot be mistaken for block structure.
        lines.push(zh ? '- 用户批注意见：' : '- User comment:');
        lines.push('```');
        lines.push(String(item.comment ?? ''));
        lines.push('```');
        if (item.selectedText !== undefined) {
          lines.push((zh ? '- 网页引用文本：' : '- Quoted page text: ') + inline(item.selectedText, 200));
        }
        if (item.selectorCandidates !== undefined) {
          lines.push(
            (zh ? '- 浏览器定位线索（不是源码路径）：' : '- Browser locator (not a source path): ') +
              item.selectorCandidates.join(' , '),
          );
        }
        if (item.domPath !== undefined) {
          lines.push((zh ? '- DOM 路径：' : '- DOM path: ') + item.domPath);
        }
        const where = [];
        if (item.tag !== undefined) where.push('<' + item.tag + '>');
        if (item.label !== undefined) where.push('aria-label="' + inline(item.label, 60) + '"');
        if (item.inShadowRoot === true) where.push(zh ? '位于 shadow DOM 内' : 'inside a shadow root');
        if (item.isFrame === true) {
          where.push(zh ? 'iframe 元素本身，内部不可读' : 'the iframe element itself; content unreadable');
        }
        if (where.length > 0) lines.push((zh ? '- 元素：' : '- Element: ') + where.join(' · '));
        lines.push('');
      });
      lines.push(
        zh
          ? '说明：上面「用户批注意见」是用户的修改要求；「网页引用文本」只是页面上的文字，用来帮助定位。'
            + '浏览器定位线索只是页面内的位置提示，不等于源码文件位置；请在本项目源码中搜索这些文本与结构特征来定位实现，'
            + '无法确定的请说明查过的文件和线索。'
          : 'Note: "User comment" is what the user wants changed; "Quoted page text" is only page copy used as a locator. '
            + 'The browser locator is a position hint inside the page, not a source file; search this project for these '
            + 'strings and structures to find the implementation, and say which files and clues you checked when unsure.',
      );
      // A closing marker makes the block self-delimiting, so a heading or list
      // the user appends afterwards is provably outside the annotations.
      lines.push(BUNDLE_END);
      return lines.join('\n');
    }

    /**
     * Find where the annotation block ends inside a submitted message.
     *
     * Two generations of messages exist:
     *
     *  1. Current bundles end with {@link BUNDLE_END}. The end marker wins
     *     outright, so whatever the user writes afterwards — including their own
     *     headings and lists — is outside the block.
     *  2. Older messages have no end marker. For those the block is found
     *     structurally: it stops at the closing "说明/Note" paragraph this plugin
     *     always writes last. A heading or list that appears *after* that note is
     *     therefore user text, which is exactly what the old rule got wrong by
     *     treating every heading as annotation content.
     *
     * `from` is the index just past the opening marker comment.
     */
    function bundleBlockEnd(text, start, from) {
      // 1. Explicit end marker.
      const endAt = text.indexOf(BUNDLE_END, from);
      if (endAt >= 0) return endAt + BUNDLE_END.length;

      // 2. Legacy block: consume only up to and including the closing note line.
      const lines = text.slice(from).split('\n');
      let consumed = 0;
      let inFence = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // Fenced comment bodies are part of the block even when they look like
        // nothing else here: a ``` line, or arbitrary text inside the fence.
        if (trimmed.startsWith('```')) {
          inFence = !inFence;
          consumed += line.length + 1;
          continue;
        }
        if (inFence) {
          consumed += line.length + 1;
          continue;
        }
        const isNote = /^(?:说明|Note)\s*[:：]/.test(trimmed);
        const belongs =
          trimmed === '' ||
          /^#{1,4}\s/.test(trimmed) ||
          /^[-*]\s/.test(trimmed) ||
          /^(?:页面标题|页面地址|条目数|Page title|Page URL|Items)\s*[:：]/.test(trimmed) ||
          isNote;
        if (!belongs) break;
        consumed += line.length + 1;
        if (isNote) {
          // The note is the last thing this plugin writes; stop right here so a
          // following user heading stays outside the block.
          break;
        }
      }
      const end = Math.min(text.length, from + Math.max(0, consumed - 1));
      return end > start ? end : from;
    }

    /** The bundle id recorded in the marker, for stable keys. */
    function bundleIdOf(text, start) {
      const close = text.indexOf(BUNDLE_CLOSE, start);
      if (close < 0) return '';
      const raw = text.slice(start + BUNDLE_OPEN.length, close);
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.bundleId === 'string' ? parsed.bundleId : '';
      } catch (error) {
        return '';
      }
    }

    /** Whether a message already carries an annotation block. */
    function hasBundle(text) {
      return typeof text === 'string' && text.includes(BUNDLE_OPEN);
    }

    function buildPrompt(locale, pageUrl, pageTitle, marks) {
      return renderBundle(buildBundle(pageUrl, pageTitle, marks), isChinese(locale));
    }

    /**
     * Shorten a selector to the part that identifies the element.
     *
     * A test hook or an id is the best handle there is, so it is kept verbatim.
     * Anything else is a positional chain whose value to the model is the last
     * step — the element itself — so the chain is dropped rather than shipped
     * as `body > main:nth-of-type(1) > …`.
     */    function shortSelector(selector) {
      if (typeof selector !== 'string' || selector === '') return selector;
      const handle = /^[a-z0-9-]*\[(?:data-testid|data-test|data-qa|data-cy|name|aria-label)=/i.test(selector)
        || /^[a-z0-9-]*#/i.test(selector);
      if (handle) return selector;
      const steps = selector.split(' > ');
      return steps[steps.length - 1];
    }

    function failureKey(error) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code === 'session/agent-busy' || code === 'session/steer-unavailable') return 'error.send.busy';
      if (code === 'session/writer-held' || code === 'session/conflict') return 'error.send.writer';
      if (code === 'session/not-found' || code === 'session/disposed') return 'error.send.notfound';
      if (code === 'gateway/cancelled' || error?.name === 'AbortError') return 'error.send.cancelled';
      const message = typeof error?.message === 'string' ? error.message : '';
      if (/aborted|cancell?ed/i.test(message)) return 'error.send.cancelled';
      if (/session\/agent-busy|agent is busy|steer/i.test(message)) return 'error.send.busy';
      if (/writer|conflict/i.test(message)) return 'error.send.writer';
      if (/not-found|no longer (open|exists)|disposed/i.test(message)) return 'error.send.notfound';
      if (/network|fetch|socket|disconnect|offline/i.test(message)) return 'error.send.offline';
      return 'error.send.generic';
    }

    function uid() {
      return Math.random().toString(36).slice(2, 10);
    }

    /* ------------------------------------------------------------------ icons */

    function glyph(children, size) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size ?? 16,
          height: size ?? 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children,
      );
    }

    function IconBack({ size }) {
      return glyph([h('path', { key: 'p', d: 'M15 5l-7 7 7 7' })], size);
    }
    function IconForward({ size }) {
      return glyph([h('path', { key: 'p', d: 'M9 5l7 7-7 7' })], size);
    }
    function IconReload({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
          h('path', { key: 'b', d: 'M20 4v5h-5' }),
        ],
        size,
      );
    }
    /**
     * A closed speech bubble with two text lines.
     *
     * The earlier glyphs drew an unclosed bubble outline, so at 16px the shape
     * read as clipped. This outline closes on itself (tail included) and the
     * interior is two straight strokes — no thin diagonals to blur.
     */
    function IconAnnotate({ size }) {
      return glyph(
        [
          h('path', {
            key: 'a',
            d: 'M4 4h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9.5L5.5 18.5V15H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
          }),
          h('path', { key: 'b', d: 'M7 8.5h9M7 12h6' }),
        ],
        size,
      );
    }
    /** Globe with a comment bubble: the Browser entry, now annotation-capable. */
    function IconBrowser({ size }) {
      return glyph(
        [
          h('circle', { key: 'a', cx: 11, cy: 11, r: 7.2 }),
          h('path', { key: 'b', d: 'M3.8 11h14.4' }),
          h('path', { key: 'c', d: 'M11 3.8c2.1 2 3.2 4.5 3.2 7.2S13.1 16.2 11 18.2C8.9 16.2 7.8 13.7 7.8 11S8.9 5.8 11 3.8Z' }),
          h('path', { key: 'd', d: 'M19.4 15.2h-4.2L13 17.6v-2.4h-.6' }),
        ],
        size,
      );
    }
    function IconSend({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M4.5 12 20 4.5 15 20l-3.6-5.2L4.5 12Z' }),
          h('path', { key: 'b', d: 'M11.4 14.8 20 4.5' }),
        ],
        size,
      );
    }
    /**
     * Six dots: the leading glyph of the comment pill, and its drag handle.
     *
     * A grid of dots reads as "grab and move" — the sliders glyph it replaced
     * looked like a settings control instead. Drawn as filled circles so it
     * stays legible at 16px without relying on stroke width.
     */
    function IconGripDots({ size }) {
      const dots = [
        [9, 6],
        [15, 6],
        [9, 12],
        [15, 12],
        [9, 18],
        [15, 18],
      ];
      return glyph(
        dots.map(([cx, cy], index) =>
          h('circle', { key: 'd' + String(index), cx, cy, r: 1.35, fill: 'currentColor', stroke: 'none' }),
        ),
        size,
      );
    }
    /** A tick: add this annotation and keep collecting. */
    function IconCheck({ size }) {
      return glyph([h('path', { key: 'p', d: 'M5 12.5 10 17.5 19 6.5' })], size);
    }
    /** Crosshair with a dot: "pick an element", and the paused counterpart. */
    function IconPick({ size, paused }) {
      return glyph(
        paused
          ? [h('path', { key: 'a', d: 'M8 6v12M16 6v12' })]
          : [
              h('path', { key: 'a', d: 'M12 4v3M12 17v3M4 12h3M17 12h3' }),
              h('circle', { key: 'b', cx: 12, cy: 12, r: 3.2 }),
            ],
        size,
      );
    }
    /** Open eye: markers are visible. */
    function IconEye({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z' }),
          h('circle', { key: 'b', cx: 12, cy: 12, r: 2.6 }),
        ],
        size,
      );
    }
    /** Struck-through eye: markers are hidden. */
    function IconEyeOff({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M2.5 12S6 6.5 12 6.5c1.5 0 2.8.4 4 1' }),
          h('path', { key: 'b', d: 'M20 9.4c1 .9 1.5 2.6 1.5 2.6S18 17.5 12 17.5c-1.4 0-2.7-.4-3.8-1' }),
          h('path', { key: 'c', d: 'M4 4l16 16' }),
        ],
        size,
      );
    }
    /** Stacked lines: the annotation detail drawer. */
    function IconList({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M4 7h16M4 12h16M4 17h10' }),
        ],
        size,
      );
    }
    function IconTrash({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M5 7h14' }),
          h('path', { key: 'b', d: 'M9 7V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V7' }),
          h('path', { key: 'c', d: 'M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7' }),
        ],
        size,
      );
    }
    function IconEdit({ size }) {
      return glyph(
        [
          h('path', { key: 'a', d: 'M4 20h4l10-10-4-4L4 16v4Z' }),
          h('path', { key: 'b', d: 'M13.5 6.5 17.5 10.5' }),
        ],
        size,
      );
    }
    function IconChevron({ open, size }) {
      return glyph([h('path', { key: 'p', d: open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6' })], size);
    }

    /* ------------------------------------------------------------- components */

    function IconButton({ label, disabled, active, onClick, children }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dshAnnotate__icon',
          title: label,
          'aria-label': label,
          'data-on': active === true ? '' : undefined,
          disabled: disabled === true,
          onClick,
        },
        children,
      );
    }

    function AnnotateBody(props) {
      const { useTabInfo, useWorkspaces, sessionId, t, activeLocale, sendPrompt } = props;
      const { tab } = useTabInfo();
      const tabId = tab.id;

      const initialUrlRef = React.useRef(undefined);
      if (initialUrlRef.current === undefined) {
        const fromParams = typeof tab.navigation?.params?.url === 'string' ? tab.navigation.params.url : '';
        initialUrlRef.current = fromParams !== '' ? fromParams : readStoredUrl(sessionId, tabId);
      }

      const [address, setAddress] = React.useState(initialUrlRef.current);
      const [current, setCurrent] = React.useState(initialUrlRef.current);
      const [pageTitle, setPageTitle] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [canBack, setCanBack] = React.useState(false);
      const [canForward, setCanForward] = React.useState(false);
      const [loadError, setLoadError] = React.useState('');
      const [guest, setGuest] = React.useState('idle');
      const [guestError, setGuestError] = React.useState('');
      const [retryToken, setRetryToken] = React.useState(0);
      const [picking, setPicking] = React.useState(false);
      const [pending, setPending] = React.useState(null);
      const [draft, setDraft] = React.useState('');
      const [marks, setMarks] = React.useState([]);
      const [editing, setEditing] = React.useState(null);
      const [editDraft, setEditDraft] = React.useState('');
      const [sendState, setSendState] = React.useState('idle');
      const [sendError, setSendError] = React.useState('');
      // The detail drawer is closed by default; adding annotations only updates
      // the count, it never pops the drawer open.
      const [trayOpen, setTrayOpen] = React.useState(false);
      /**
       * Whether the floating command bar is on screen.
       *
       * Separate from `picking`: `picking` is "the page is accepting a click",
       * which the comment box deliberately pauses while typing. Closing the bar
       * (×) keeps the collected marks and the unsaved draft; only the bar hides.
       */
      const [barOpen, setBarOpen] = React.useState(false);
      /** The user paused picking from the bar; the page is free to be used. */
      const [pickPaused, setPickPaused] = React.useState(false);
      /** Show or hide the numbered pins on the page. Never touches `marks`. */
      const [showPins, setShowPins] = React.useState(true);
      /** Dragged bar position in viewport coordinates; `null` = default centred. */
      const [barAt, setBarAt] = React.useState(null);
      // Where the comment popover sits, in panel coordinates. `null` means
      // "follow the selected element"; once dragged, the user's offset wins
      // until another element is picked.
      const [popoverAt, setPopoverAt] = React.useState(null);

      const hostRef = React.useRef(null);
      const elementRef = React.useRef(null);
      const readyRef = React.useRef(false);
      const pendingUrlRef = React.useRef('');
      const marksRef = React.useRef(marks);
      const pickingRef = React.useRef(picking);
      const pendingRef = React.useRef(pending);
      const draftRef = React.useRef(draft);
      const showPinsRef = React.useRef(showPins);
      /** Latest `setPickMode`, so the panel key listener is not rebuilt on each render. */
      const setPickModeRef = React.useRef(() => {});
      const tabActionsRef = React.useRef(tab.actions);
      const sentTimerRef = React.useRef(0);
      /** Guards one in-flight submission so a double click cannot send twice. */
      const submittingRef = React.useRef(false);

      tabActionsRef.current = tab.actions;
      marksRef.current = marks;
      pickingRef.current = picking;

      // Select the storage identity itself, not the snapshot: a string selector
      // keeps the render stable while unrelated workspaces change.
      const selectedKey =
        typeof useWorkspaces === 'function' ? useWorkspaces((snapshot) => workspaceKeyOf(snapshot, sessionId)) : undefined;
      const [workspaceKey, setWorkspaceKey] = React.useState(() => selectedKey);

      React.useEffect(() => {
        if (selectedKey !== undefined) {
          setWorkspaceKey(selectedKey);
          return undefined;
        }
        // A Host that never reports a ready workspace still gets a guest: the
        // session-scoped identity is the documented ordinary fallback.
        const timer = setTimeout(() => {
          setWorkspaceKey((value) => value ?? 'session:' + String(sessionId));
        }, WORKSPACE_FALLBACK_MS);
        return () => clearTimeout(timer);
      }, [selectedKey, sessionId]);

      React.useEffect(
        () => () => {
          if (sentTimerRef.current !== 0) clearTimeout(sentTimerRef.current);
        },
        [],
      );

      // The guest: acquire one lease, mount one webview, and keep its navigation
      // state in React. Every path out (unmount, retry, tab abort) releases it.
      React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (host === null) return undefined;
        const bridge = globalThis.dshDesktop?.browser;
        if (bridge === undefined || typeof bridge.acquire !== 'function') {
          setGuest('unsupported');
          return undefined;
        }
        if (workspaceKey === undefined) return undefined;

        let cancelled = false;
        let element = null;
        let lease;
        let unsubscribeOpen;
        const signal = tab.signal;

        setGuest('acquiring');
        setGuestError('');

        const sync = () => {
          if (element === null) return;
          try {
            const url = element.getURL();
            if (typeof url === 'string' && url !== '' && !url.startsWith('about:')) {
              setCurrent(url);
              setAddress((value) => (value === url ? value : url));
              writeStoredUrl(sessionId, tabId, url);
            }
            setPageTitle(element.getTitle() || '');
            setLoading(typeof element.isLoading === 'function' ? element.isLoading() : false);
            setCanBack(typeof element.canGoBack === 'function' ? element.canGoBack() : false);
            setCanForward(typeof element.canGoForward === 'function' ? element.canGoForward() : false);
          } catch (error) {
            /* the guest is gone; its events report it */
          }
        };

        const inject = () => {
          if (element === null) return;
          element.executeJavaScript(AGENT_BOOT, false).then(
            () => {
              if (cancelled) return;
              readyRef.current = true;
              syncMarksToPage(element, marksRef.current, showPinsRef.current);
              if (pickingRef.current) {
                element.executeJavaScript(agentCall('setPickMode', true), false).catch(() => {});
              }
              const queued = pendingUrlRef.current;
              if (queued !== '') {
                pendingUrlRef.current = '';
                element.loadURL(queued).catch(() => {});
              }
            },
            () => {
              /* a navigation interrupted the injection; dom-ready injects again */
            },
          );
        };

        const dispose = () => {
          if (unsubscribeOpen !== undefined) {
            unsubscribeOpen();
            unsubscribeOpen = undefined;
          }
          readyRef.current = false;
          if (element !== null) {
            try {
              element.remove();
            } catch (error) {
              /* already detached */
            }
            element = null;
          }
          elementRef.current = null;
          const held = lease;
          lease = undefined;
          if (held !== undefined) {
            try {
              bridge.release(held).catch(() => {});
            } catch (error) {
              /* the window is closing */
            }
          }
        };

        const create = async () => {
          let reservation;
          try {
            reservation = await bridge.acquire(workspaceKey);
          } catch (error) {
            if (!cancelled) {
              setGuest('failed');
              setGuestError(error instanceof Error ? error.message : String(error));
            }
            return;
          }
          if (cancelled) {
            try {
              bridge.release(reservation.lease).catch(() => {});
            } catch (error) {
              /* nothing to release */
            }
            return;
          }
          lease = reservation.lease;
          if (element !== null) return;
          const view = document.createElement('webview');
          element = view;
          elementRef.current = view;
          view.className = 'dshAnnotate__frame';
          view.setAttribute('name', reservation.lease);
          view.setAttribute('partition', reservation.partition);
          view.setAttribute('allowpopups', '');
          view.setAttribute('src', 'about:blank#' + reservation.lease);
          view.setAttribute('aria-label', t('tab.title'));
          view.addEventListener('dom-ready', () => {
            if (cancelled) return;
            inject();
            sync();
          });
          view.addEventListener('did-start-loading', () => {
            if (!cancelled) setLoading(true);
          });
          view.addEventListener('did-stop-loading', () => {
            if (cancelled) return;
            setLoading(false);
            sync();
          });
          view.addEventListener('did-navigate', () => {
            if (cancelled) return;
            setLoadError('');
            sync();
            inject();
          });
          view.addEventListener('did-navigate-in-page', () => {
            if (cancelled) return;
            sync();
            inject();
          });
          view.addEventListener('page-title-updated', () => {
            if (cancelled) return;
            try {
              setPageTitle(view.getTitle() || '');
            } catch (error) {
              /* guest gone */
            }
          });
          view.addEventListener('did-fail-load', (event) => {
            if (cancelled) return;
            if (event.isMainFrame === true && event.errorCode !== -3) {
              setLoadError(
                t('error.load') + ' (' + String(event.errorCode ?? '') + ' ' + String(event.errorDescription ?? '') + ')',
              );
              setLoading(false);
            }
          });
          const lost = () => {
            if (cancelled) return;
            readyRef.current = false;
            setGuest('failed');
            setGuestError(t('guest.failed'));
            setLoading(false);
          };
          view.addEventListener('render-process-gone', lost);
          view.addEventListener('destroyed', lost);
          try {
            unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => {
              try {
                // A page-requested popup becomes another Browser tab, i.e. the
                // same annotation-capable type this tab is.
                tabActionsRef.current?.openTab?.(BROWSER_KIND, { params: { url }, revealIfOpened: false });
              } catch (error) {
                /* the tab moved on */
              }
            });
          } catch (error) {
            /* older shells without the subscription */
          }
          host.appendChild(view);
          setGuest('ready');
          // A URL the user already submitted wins over the restored checkpoint.
          if (pendingUrlRef.current === '' && initialUrlRef.current !== '') {
            pendingUrlRef.current = initialUrlRef.current;
          }
        };

        const onAbort = () => {
          cancelled = true;
          dispose();
        };
        if (signal !== undefined && signal.aborted) {
          onAbort();
          return undefined;
        }
        if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true });
        create().catch((error) => {
          if (!cancelled) {
            setGuest('failed');
            setGuestError(error instanceof Error ? error.message : String(error));
          }
        });

        return () => {
          cancelled = true;
          if (signal !== undefined) signal.removeEventListener('abort', onAbort);
          dispose();
        };
        // The guest is created once per (storage identity, tab, retry): every
        // navigation and injection reads live state through refs instead, so a
        // page load never tears the webview down.
      }, [workspaceKey, tabId, tab.signal, retryToken]);

      // Push the numbered pins into the page whenever the list or their
      // visibility changes.
      React.useEffect(() => {
        syncMarksToPage(elementRef.current, marks, showPins);
      }, [marks, guest, showPins]);

      // Annotations taken on an earlier page keep their own address when sent;
      // say so, because their pins cannot be drawn on the page now shown.
      const foreign = marks.filter(
        (mark) => typeof mark.url === 'string' && mark.url !== '' && mark.url !== current,
      );

      // Read the picker while the mode is on; the page pauses itself once an
      // element is taken, so this keeps running and picks up the next one
      // without a toolbar trip.
      React.useEffect(() => {
        if (!picking || tab.visible !== true) return undefined;
        const timer = setInterval(() => {
          const view = elementRef.current;
          if (view === null || !readyRef.current) return;
          view.executeJavaScript(agentCall('drain'), false).then(
            (result) => {
              // Esc inside the page ends the mode; mirror it in the toolbar.
              if (result?.mode === false && pickingRef.current) setPicking(false);
              const selection = result?.selection;
              if (selection !== undefined && selection !== null) {
                setPending(selection);
                setDraft('');
                // A new element re-anchors the popover: a position dragged for
                // the previous element would describe the wrong place.
                setPopoverAt(null);
                // Collecting must not pop the drawer open: it only updates the
                // count. The drawer is something the user opens deliberately.
                return;
              }
              // Nothing picked: a click on the page may have landed outside the
              // comment box. Dismiss only when there is no text to lose.
              if (pendingRef.current === null) return;
              view.executeJavaScript(agentCall('drainOutside'), false).then(
                (outside) => {
                  if (outside !== true) return;
                  if (draftRef.current.trim() !== '') return;
                  dismissPending();
                },
                () => {},
              );
            },
            () => {
              /* guest busy or navigated */
            },
          );
        }, POLL_MS);
        return () => clearInterval(timer);
      }, [picking, tab.visible]);

      React.useEffect(() => {
        const actions = tab.actions;
        if (actions === undefined || typeof actions.bindCommands !== 'function') return undefined;
        const reload = () => {
          const view = elementRef.current;
          if (view === null) return;
          try {
            view.reload();
          } catch (error) {
            /* guest gone */
          }
        };
        return actions.bindCommands({ refresh: reload });
      }, [tab.actions]);

      const runInPage = React.useCallback((method, argument, extra) => {
        const view = elementRef.current;
        if (view === null || !readyRef.current) return;
        try {
          view.executeJavaScript(agentCall(method, argument, extra), false).catch(() => {});
        } catch (error) {
          /* guest gone */
        }
      }, []);

      const setPickMode = React.useCallback(
        (on) => {
          setPicking(on);
          setPickPaused(false);
          // Turning the mode on shows the command bar; turning it off hides it
          // but keeps the collected marks and any unsaved draft.
          setBarOpen(on);
          if (!on) setTrayOpen(false);
          runInPage('setPickMode', on, {
            pick: t('page.hint.pick'),
            paused: t('page.hint.paused'),
          });
          // Leaving the mode also drops an unfinished comment: it describes an
          // element the user is no longer annotating.
          if (!on) {
            setPending(null);
            setDraft('');
          }
        },
        [runInPage, t],
      );
      setPickModeRef.current = setPickMode;

      /** Continue picking after a comment is saved or cancelled. */
      const resumePicking = React.useCallback(() => {
        runInPage('resume');
      }, [runInPage]);

      // While the comment box is open, keep the page from collecting another
      // element: a stray click must not replace the element being described.
      React.useEffect(() => {
        if (pending === null) return;
        runInPage('pause');
      }, [pending, runInPage]);

      const navigate = (value) => {
        const target = normalizeUrl(value);
        if (target === '') {
          setLoadError(t('address.invalid'));
          return;
        }
        setLoadError('');
        setAddress(target);
        const view = elementRef.current;
        if (view === null || !readyRef.current) {
          pendingUrlRef.current = target;
          return;
        }
        try {
          view.loadURL(target).catch(() => {});
        } catch (error) {
          pendingUrlRef.current = target;
        }
      };

      const submitAddress = (event) => {
        event.preventDefault();
        navigate(address);
      };

      const goBack = () => {
        try {
          elementRef.current?.goBack();
        } catch (error) {
          /* guest gone */
        }
      };
      const goForward = () => {
        try {
          elementRef.current?.goForward();
        } catch (error) {
          /* guest gone */
        }
      };
      const reload = () => {
        try {
          elementRef.current?.reload();
        } catch (error) {
          /* guest gone */
        }
      };

      /** Shape one annotation from the element being described. */
      const buildMark = (comment) => {
        if (pending === null) return null;
        const text = comment.trim().slice(0, MAX_COMMENT);
        if (text === '') return null;
        const nextNumber = marksRef.current.reduce((max, mark) => Math.max(max, mark.n), 0) + 1;
        return {
          id: uid(),
          n: nextNumber,
          comment: text,
          status: 'draft',
          selector: typeof pending.selector === 'string' ? pending.selector : '',
          stableHandle: typeof pending.stableHandle === 'string' ? pending.stableHandle : '',
          domPath: typeof pending.domPath === 'string' ? pending.domPath : '',
          viewport: pending.viewport ?? {},
          sourceHint: typeof pending.sourceHint === 'string' ? pending.sourceHint : '',
          tag: typeof pending.tag === 'string' ? pending.tag : 'element',
          label: typeof pending.label === 'string' ? pending.label : '',
          text: typeof pending.text === 'string' ? pending.text : '',
          html: typeof pending.html === 'string' ? pending.html : '',
          rect: pending.rect ?? {},
          shadow: pending.shadow === true,
          frame: pending.frame === true,
          url: typeof pending.url === 'string' ? pending.url : '',
        };
      };

      const addMark = () => {
        if (pending === null || marksRef.current.length >= MAX_MARKS) return;
        const mark = buildMark(draft);
        if (mark === null) return;
        setMarks((previous) => [...previous, mark]);
        setPending(null);
        setDraft('');
        setSendState('idle');
        setSendError('');
        // Straight back to picking: the next element needs no toolbar trip.
        resumePicking();
      };

      /** Drop the element being described without leaving the mode. */
      const cancelPending = () => {
        setPending(null);
        setDraft('');
        resumePicking();
      };

      // The picker poll reads these between renders; a stale value would either
      // discard typed text or leave an empty box open.
      React.useEffect(() => {
        pendingRef.current = pending;
        draftRef.current = draft;
        showPinsRef.current = showPins;
      }, [pending, draft, showPins]);
      const dismissPending = cancelPending;

      const removeMark = (id) => {
        setMarks((previous) => {
          const kept = previous.filter((mark) => mark.id !== id);
          return kept.map((mark, index) => ({ ...mark, n: index + 1 }));
        });
        setEditing((value) => (value === id ? null : value));
      };

      const beginEdit = (mark) => {
        setEditing(mark.id);
        setEditDraft(mark.comment);
      };

      const commitEdit = () => {
        const text = editDraft.trim().slice(0, MAX_COMMENT);
        if (text === '' || editing === null) return;
        setMarks((previous) => previous.map((mark) => (mark.id === editing ? { ...mark, comment: text } : mark)));
        setEditing(null);
        setEditDraft('');
        setSendState('idle');
      };

      const clearAll = () => {
        setMarks([]);
        setEditing(null);
        setPending(null);
        setDraft('');
        setSendState('idle');
        setSendError('');
      };

      const unsent = marks.filter((mark) => mark.status !== 'sent');

      // A page that changed under its annotations must not silently attribute
      // them to the new URL: unsent marks carry the address they were taken on.
      const pageUrlFor = (list) => {
        const own = list.find((mark) => typeof mark.url === 'string' && mark.url !== '');
        return own === undefined ? current : own.url;
      };

      /**
       * Send a batch straight through.
       *
       * `override` exists because the confirm tick adds a mark and sends in the
       * same gesture: React state has not re-rendered yet, so `unsent` would not
       * include the newest row.
       */
      const send = (override) => {
        const batch = Array.isArray(override) ? override : unsent;
        if (sendState === 'sending' || batch.length === 0) return;
        // One batch, one submission: a fast second click must not enqueue twice.
        if (submittingRef.current) return;
        submittingRef.current = true;
        setSendState('sending');
        setSendError('');
        // Stop collecting while the batch is in flight. New rows would not belong
        // to this submission, and the page would show pins for annotations that
        // are still unsent; the picker resumes when the send settles.
        runInPage('pause');
        const text = buildPrompt(
          typeof activeLocale === 'function' ? activeLocale() : 'en',
          pageUrlFor(batch),
          pageTitle,
          batch,
        );
        Promise.resolve(sendPrompt(sessionId, text)).then(
          () => {
            submittingRef.current = false;
            // Remove exactly the rows this submission carried. Clearing the whole
            // list would also drop anything collected after the click if the
            // picker was still armed, and the pins are synced from this list, so
            // removing by id keeps the page consistent with what was sent.
            const sentIds = new Set(batch.map((mark) => mark.id));
            setMarks((previous) =>
              previous.filter((mark) => !sentIds.has(mark.id)).map((mark, index) => ({ ...mark, n: index + 1 })),
            );
            setEditing(null);
            setEditDraft('');
            setSendState('sent');
            if (sentTimerRef.current !== 0) clearTimeout(sentTimerRef.current);
            sentTimerRef.current = setTimeout(() => setSendState('idle'), 2600);
            // Resume collecting unless the user had already paused the picker.
            if (!pickPaused) runInPage('resume');
          },
          (error) => {
            submittingRef.current = false;
            console.error('[web-annotate] sending annotations failed:', error);
            setSendState('error');
            setSendError(t(failureKey(error)));
            // The batch is still here, so let the user keep annotating or retry.
            if (!pickPaused) runInPage('resume');
          },
        );
      };

      /** Grow the one-line pill field as the text wraps, up to the CSS cap. */
      const autoGrow = (event) => {
        const node = event?.currentTarget;
        if (node === null || node === undefined) return;
        node.style.height = 'auto';
        node.style.height = Math.min(node.scrollHeight, 120) + 'px';
      };

      const onComposerKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          // Escape closes the box, not the mode: keep annotating.
          cancelPending();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          addMark();
        }
      };

      const onEditKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(null);
          setEditDraft('');
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commitEdit();
        }
      };

      /**
       * Escape, innermost layer first.
       *
       * The comment box and the inline editor handle their own Escape while
       * focused. This listener covers the rest of the panel: with the drawer open
       * it closes the drawer, otherwise it leaves the mode. It never discards a
       * comment that is still being typed — that box owns its own Escape.
       */
      React.useEffect(() => {
        if (!barOpen) return undefined;
        const onPanelKey = (event) => {
          if (event.key !== 'Escape') return;
          const tag = event.target?.tagName;
          // A focused textarea keeps its own Escape (closing the box/editor).
          if (tag === 'TEXTAREA' || tag === 'INPUT') return;
          if (pending !== null) return;
          event.preventDefault();
          if (editing !== null) {
            setEditing(null);
            setEditDraft('');
            return;
          }
          if (trayOpen) {
            setTrayOpen(false);
            return;
          }
          setBarOpen(false);
          setPickModeRef.current(false);
        };
        document.addEventListener('keydown', onPanelKey, true);
        return () => document.removeEventListener('keydown', onPanelKey, true);
      }, [barOpen, trayOpen, pending, editing]);

      const startPanel =
        current === '' && guest === 'ready'
          ? h(
              'div',
              { className: 'dshAnnotate__start' },
              h('div', { className: 'dshAnnotate__startTitle' }, t('start.title')),
              h('div', { className: 'dshAnnotate__startHint' }, t('start.hint')),
            )
          : null;

      const guestNotice =
        guest === 'acquiring'
          ? h('div', { className: 'dshAnnotate__notice' }, t('guest.acquiring'))
          : guest === 'failed' || guest === 'unsupported'
            ? h(
                'div',
                { className: 'dshAnnotate__notice', 'data-tone': 'error', role: 'status' },
                guest === 'unsupported' ? t('guest.unsupported') : t('guest.failed') + (guestError === '' ? '' : '：' + guestError),
                guest === 'failed'
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshAnnotate__noticeAction',
                        onClick: () => setRetryToken((value) => value + 1),
                      },
                      t('guest.retry'),
                    )
                  : null,
              )
            : null;

      const loadNotice =
        loadError === ''
          ? null
          : h(
              'div',
              { className: 'dshAnnotate__notice', 'data-tone': 'error', role: 'alert' },
              loadError,
            );

      const pickNotice =
        picking && guest === 'ready'
          ? h('div', { className: 'dshAnnotate__notice', 'data-tone': 'brand' }, t('pick.hint'))
          : null;

      /**
       * Place the popover just under the element that was clicked.
       *
       * The selection carries coordinates from inside the guest, which match the
       * panel's own viewport (the guest fills it). While the panel is still
       * unmeasured — first render, before `hostRef` is attached — the page's own
       * viewport size is the best available stand-in, so the popover lands in the
       * right place immediately instead of at 8,8 and then jumping.
       *
       * A dragged position (`popoverAt`) overrides everything.
       */
      const popoverStyle = (() => {
        if (popoverAt !== null) return { left: popoverAt.x + 'px', top: popoverAt.y + 'px' };
        const rect = pending?.rect ?? {};
        const viewport = pending?.viewport ?? {};
        const host = hostRef.current;
        const box = host === null ? null : host.getBoundingClientRect();
        const panelWidth = box !== null && box.width > 0 ? box.width : viewport.w;
        const panelHeight = box !== null && box.height > 0 ? box.height : viewport.h;
        const POPOVER_W = 320;
        const POPOVER_H = 190;
        const GAP = 8;
        if (typeof rect.x !== 'number' || typeof rect.y !== 'number') {
          // No geometry (shadow root, unreadable frame): pin to the bottom-left
          // of the page area rather than guessing.
          return { left: '12px', bottom: '12px' };
        }
        const maxLeft = Math.max(8, (panelWidth || POPOVER_W) - POPOVER_W - 8);
        const left = Math.max(8, Math.min(rect.x, maxLeft));
        const below = rect.y + (typeof rect.h === 'number' ? rect.h : 0) + GAP;
        const above = rect.y - POPOVER_H - GAP;
        const top = below + POPOVER_H <= panelHeight || above < 8 ? below : above;
        const maxTop = Math.max(8, (panelHeight || POPOVER_H) - POPOVER_H - 8);
        return {
          left: left + 'px',
          top: Math.max(8, Math.min(top, maxTop)) + 'px',
        };
      })();

      /** Drag the popover by its header. */
      const onGripPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const panel = hostRef.current?.parentElement ?? hostRef.current;
        if (panel === null || panel === undefined) return;
        const host = hostRef.current;
        const box = (host === null ? null : host.getBoundingClientRect()) ?? panel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = parseFloat(popoverStyle.left ?? '0') || 0;
        const startTop = parseFloat(popoverStyle.top ?? '0') || 0;
        const limitX = Math.max(8, box.width - 180);
        const limitY = Math.max(8, box.height - 60);
        const move = (moveEvent) => {
          const nextLeft = Math.max(4, Math.min(startLeft + (moveEvent.clientX - startX), limitX));
          const nextTop = Math.max(4, Math.min(startTop + (moveEvent.clientY - startY), limitY));
          setPopoverAt({ x: nextLeft, y: nextTop });
        };
        const stop = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        event.preventDefault();
      };

      const composer =
        pending === null
          ? null
          : h(
              'div',
              {
                className: 'dshAnnotate__composer dshAnnotate__composer--float',
                style: popoverStyle,
              },
              // One pill: drag handle glyph, field, send button. The header row is
              // gone — the whole capsule is the box.
              h(
                'div',
                {
                  className: 'dshAnnotate__composerGrip',
                  onPointerDown: onGripPointerDown,
                  title: t('composer.drag'),
                },
                h(IconGripDots, { size: 16 }),
              ),
              h(
                'div',
                { className: 'dshAnnotate__composerRow' },
                h('textarea', {
                  className: 'dshAnnotate__textarea',
                  value: draft,
                  autoFocus: true,
                  maxLength: MAX_COMMENT,
                  rows: 1,
                  // No placeholder: the pill reads as a field already, and the
                  // hint text crowded the short input. The accessible name
                  // still comes from `aria-label`.
                  'aria-label': t('composer.title'),
                  onChange: (event) => {
                    setDraft(event.target.value);
                    autoGrow(event);
                  },
                  onKeyDown: onComposerKey,
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__confirm',
                    disabled: draft.trim() === '' || marks.length >= MAX_MARKS,
                    // Adds this annotation and returns to picking, so the next
                    // element can be clicked straight away. Sending the batch is
                    // the toolbar's job — one button, one meaning.
                    title: t('composer.save'),
                    'aria-label': t('composer.save'),
                    onClick: addMark,
                  },
                  h(IconCheck, { size: 16 }),
                ),
              ),
            );

      const markRow = (mark) =>
        h(
          'div',
          { className: 'dshAnnotate__mark', key: mark.id, 'data-status': mark.status },
          h('span', { className: 'dshAnnotate__badge' }, String(mark.n)),
          h(
            'div',
            { className: 'dshAnnotate__markBody' },
            h(
              'div',
              { className: 'dshAnnotate__selector', title: mark.selector === '' ? mark.tag : mark.selector },
              // The full chain is unreadable in a narrow column: five different
              // elements all truncate to the same `div:nth-of-type(2) > …`. Lead
              // with the element's own text — that is what the user recognises —
              // and keep the whole path in the tooltip.
              typeof mark.text === 'string' && mark.text !== ''
                ? mark.text
                : mark.selector === ''
                  ? '<' + mark.tag + '>'
                  : shortSelector(mark.selector),
            ),
            editing === mark.id
              ? h(
                  'div',
                  { className: 'dshAnnotate__edit' },
                  h('textarea', {
                    className: 'dshAnnotate__editBox',
                    value: editDraft,
                    autoFocus: true,
                    maxLength: MAX_COMMENT,
                    onChange: (event) => setEditDraft(event.target.value),
                    onKeyDown: onEditKey,
                    'aria-label': t('mark.edit'),
                  }),
                  h(
                    'div',
                    { className: 'dshAnnotate__editActions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshAnnotate__editSave',
                        disabled: editDraft.trim() === '',
                        onClick: commitEdit,
                      },
                      t('mark.save'),
                    ),
                  ),
                )
              : h('div', { className: 'dshAnnotate__markComment' }, mark.comment),
          ),
          h(
            'div',
            { className: 'dshAnnotate__markActions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshAnnotate__miniIcon',
                title: t('mark.edit'),
                'aria-label': t('mark.edit'),
                onClick: () => beginEdit(mark),
              },
              h(IconEdit, { size: 14 }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshAnnotate__miniIcon',
                title: t('mark.delete'),
                'aria-label': t('mark.delete'),
                onClick: () => removeMark(mark.id),
              },
              h(IconTrash, { size: 14 }),
            ),
          ),
        );

      // The tray is the list of collected annotations. It has nothing to show
      // until one exists, so an empty tray is not rendered at all — turning on
      // annotate mode used to reveal an empty "0 annotations" strip that ate
      // page height for no reason. The comment box is a separate popover, so it
      // does not need the tray either.
      const trayVisible = marks.length > 0 || sendState !== 'idle';

      const trayBody = trayOpen
        ? h(
            'div',
            { className: 'dshAnnotate__trayBody' },
            // The comment box is no longer part of the tray: it floats next to
            // the element being described (rendered inside the viewport below).
            marks.length === 0
              ? h('div', { className: 'dshAnnotate__empty' }, t('tray.empty'))
              : marks.map(markRow),
            sendState === 'error'
              ? h('div', { className: 'dshAnnotate__status', 'data-tone': 'error', role: 'alert' }, sendError)
              : null,
            sendState === 'sent'
              ? h('div', { className: 'dshAnnotate__status', 'data-tone': 'success', role: 'status' }, t('send.sent'))
              : null,
          )
        : null;

      const sendLabel =
        sendState === 'sending'
          ? t('send.sending')
          : sendState === 'sent'
            ? t('send.sent')
            : t('bar.send');

      /** True while a batch is in flight: every control that would change this
       *  batch is disabled, so the sent set cannot drift mid-flight. */
      const busy = sendState === 'sending';

      /**
       * Pause or resume picking without leaving the mode.
       *
       * Pausing lets the user use the page normally while the collected marks
       * stay put; resuming restores hover and click selecting. The comment box
       * is closed first, because a paused picker has nothing to attach it to.
       */
      const togglePause = () => {
        if (pickPaused) {
          setPickPaused(false);
          runInPage('resume');
        } else {
          setPickPaused(true);
          setPending(null);
          runInPage('pause');
        }
      };

      /**
       * Send the whole batch, including a comment that is still being written.
       *
       * The unsaved draft is added to this submission explicitly instead of via
       * `setMarks()` — React state would not have re-rendered yet, and reading
       * `marks` afterwards would silently drop the last annotation. An empty
       * draft adds nothing and does not block the already-saved marks.
       */
      const sendAll = () => {
        if (busy) return;
        // A row being edited is committed first, so the screen and the wire
        // cannot disagree about its text.
        if (editing !== null) {
          commitEdit();
          return;
        }
        const extra = pending !== null ? buildMark(draft) : null;
        const batch = extra === null ? unsent : [...unsent, extra];
        if (batch.length === 0) return;
        if (extra !== null) {
          setMarks((previous) => [...previous, extra]);
          setPending(null);
          setDraft('');
        }
        send(batch);
      };

      /**
       * Bar placement in viewport coordinates.
       *
       * Default is centred at the bottom via CSS; once dragged, an explicit
       * left/top wins and is clamped to the viewport on every resize.
       */
      const barStyle = (() => {
        if (barAt === null) return undefined;
        const host = hostRef.current;
        const box = host === null || host === undefined ? null : host.getBoundingClientRect();
        const width = box !== null && box.width > 0 ? box.width : 0;
        const height = box !== null && box.height > 0 ? box.height : 0;
        const left = Math.max(4, Math.min(barAt.x, Math.max(4, width - 120)));
        const top = Math.max(4, Math.min(barAt.y, Math.max(4, height - 60)));
        return { left: left + 'px', top: top + 'px' };
      })();

      /**
       * The drawer sits above the bar, or below it when the bar was dragged near
       * the top so the drawer would otherwise leave the viewport.
       */
      /**
       * Place the drawer next to the bar.
       *
       * Two anchors matter: horizontally it should line up with the bar (so the
       * pair reads as one control), and vertically it opens away from whichever
       * viewport edge the bar is closer to. When the bar is centred the drawer is
       * centred too; when it was dragged the drawer follows its left edge, then
       * the whole box is clamped so it never leaves the viewport.
       *
       * The width is bounded here rather than in CSS because the clamp needs the
       * viewport width: a fixed `left` plus an unbounded width is what let the
       * drawer hang off the left edge.
       */
      const drawerStyle = (() => {
        const host = hostRef.current;
        const box = host === null || host === undefined ? null : host.getBoundingClientRect();
        const width = box !== null && box.width > 0 ? box.width : 0;
        const height = box !== null && box.height > 0 ? box.height : 0;
        const maxWidth = Math.max(240, width - 24);
        const gap = 8;
        if (barAt === null) {
          // Centred bar: centre the drawer under the same axis, above the bar.
          return { bottom: '76px', width: 'min(420px, calc(100% - 24px))' };
        }
        const drawerWidth = Math.min(420, maxWidth);
        // Align to the bar's left edge, then keep the whole box on screen.
        const left = Math.max(gap, Math.min(barAt.x, Math.max(gap, width - drawerWidth - gap)));
        const nearTop = barAt.y < height / 2;
        const vertical = nearTop
          ? { top: Math.round(barAt.y + 58) + 'px' }
          : { bottom: Math.max(gap, Math.round(height - barAt.y + gap)) + 'px' };
        return { ...vertical, left: Math.round(left) + 'px', width: Math.round(drawerWidth) + 'px' };
      })();

      /**
       * Drag the bar by its grip.
       *
       * Pointer events cover mouse, pen and touch. The drag never reaches the
       * page: `pointerdown` is consumed here, and the visited page cannot see
       * it as a selection click.
       */
      const onBarPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const host = hostRef.current;
        if (host === null || host === undefined) return;
        const box = host.getBoundingClientRect();
        const bar = event.currentTarget.closest?.('.dshAnnotate__bar');
        const barBox = bar === null || bar === undefined ? null : bar.getBoundingClientRect();
        if (barBox === null) return;
        const offsetX = event.clientX - barBox.left;
        const offsetY = event.clientY - barBox.top;
        const move = (moveEvent) => {
          const x = Math.max(4, Math.min(moveEvent.clientX - box.left - offsetX, Math.max(4, box.width - 120)));
          const y = Math.max(4, Math.min(moveEvent.clientY - box.top - offsetY, Math.max(4, box.height - 60)));
          setBarAt({ x, y });
        };
        const stop = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        event.preventDefault();
        event.stopPropagation();
      };

      return h(
        'div',
        { className: 'dshAnnotate', 'data-guest': guest },
        h(
          'div',
          { className: 'dshAnnotate__toolbar' },
          h(
            IconButton,
            { label: t('toolbar.back'), disabled: !canBack, onClick: goBack },
            h(IconBack, null),
          ),
          h(
            IconButton,
            { label: t('toolbar.forward'), disabled: !canForward, onClick: goForward },
            h(IconForward, null),
          ),
          h(IconButton, { label: t('toolbar.reload'), disabled: guest !== 'ready', onClick: reload }, h(IconReload, null)),
          h(
            'form',
            { className: 'dshAnnotate__addressForm', onSubmit: submitAddress },
            h('input', {
              className: 'dshAnnotate__address',
              value: address,
              placeholder: t('address.placeholder'),
              'aria-label': t('address.label'),
              spellCheck: false,
              autoFocus: initialUrlRef.current === '',
              onChange: (event) => setAddress(event.target.value),
            }),
            h(
              'button',
              { type: 'submit', className: 'dshAnnotate__btn', disabled: guest !== 'ready' },
              t('toolbar.open'),
            ),
          ),
          h(
            IconButton,
            {
              label: picking ? t('toolbar.annotateOn') : t('toolbar.annotate'),
              active: picking,
              disabled: guest !== 'ready' || current === '',
              onClick: () => setPickMode(!picking),
            },
            h(IconAnnotate, null),
          ),
        ),
        h(
          'div',
          { className: 'dshAnnotate__viewport' },
          h('div', { className: 'dshAnnotate__host', ref: hostRef }),
          startPanel,
          guestNotice,
          loadNotice,
          pickNotice,
          foreign.length > 0
            ? h(
                'div',
                { className: 'dshAnnotate__notice', 'data-tone': 'brand' },
                t('notice.foreign').replace('%n', String(foreign.length)),
              )
            : null,
          loading ? h('div', { className: 'dshAnnotate__notice' }, t('page.loading')) : null,
          // The popover lives inside the viewport so its coordinates are page
          // coordinates, not the panel's.
          composer,
          // The single control surface for the batch. It is a sibling overlay
          // inside the viewport, never mounted into the visited page's DOM.
          barOpen
            ? h(
                'div',
                {
                  className: 'dshAnnotate__bar',
                  style: barStyle,
                  'data-dragged': barAt === null ? undefined : '',
                  role: 'toolbar',
                  'aria-label': t('bar.label'),
                },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barGrip',
                    title: t('bar.drag'),
                    'aria-label': t('bar.drag'),
                    onPointerDown: onBarPointerDown,
                    onKeyDown: (event) => {
                      // Home puts the bar back in its default place.
                      if (event.key === 'Home') {
                        event.preventDefault();
                        setBarAt(null);
                      }
                    },
                  },
                  h(IconGripDots, { size: 15 }),
                ),
                h(
                  'span',
                  { className: 'dshAnnotate__barLabel' },
                  h(
                    'span',
                    { className: 'dshAnnotate__barLabelLong' },
                    (pickPaused ? t('bar.paused') : t('bar.annotating')) + ' · ' + String(marks.length),
                  ),
                  h(
                    'span',
                    { className: 'dshAnnotate__barLabelShort' },
                    (pickPaused ? t('bar.pausedShort') : t('bar.short')) + ' · ' + String(marks.length),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barTool',
                    'data-on': pickPaused ? '' : undefined,
                    'aria-pressed': !pickPaused,
                    title: pickPaused ? t('bar.resume') : t('bar.pause'),
                    'aria-label': pickPaused ? t('bar.resume') : t('bar.pause'),
                    disabled: sendState === 'sending' || draft.trim() !== '',
                    onClick: togglePause,
                  },
                  h(IconPick, { size: 17, paused: pickPaused }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barTool',
                    'aria-pressed': showPins,
                    title: showPins ? t('bar.hidePins') : t('bar.showPins'),
                    'aria-label': showPins ? t('bar.hidePins') : t('bar.showPins'),
                    onClick: () => setShowPins((value) => !value),
                  },
                  showPins ? h(IconEye, { size: 17 }) : h(IconEyeOff, { size: 17 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barTool',
                    'data-on': trayOpen ? '' : undefined,
                    'aria-expanded': trayOpen,
                    title: t('bar.details'),
                    'aria-label': t('bar.details'),
                    onClick: () => setTrayOpen((value) => !value),
                  },
                  h(IconList, { size: 17 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barTool',
                    title: t('bar.clear'),
                    'aria-label': t('bar.clear'),
                    disabled: (marks.length === 0 && draft.trim() === '') || sendState === 'sending',
                    onClick: clearAll,
                  },
                  h(IconTrash, { size: 17 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barSend',
                    'data-sending': sendState === 'sending' ? '' : undefined,
                    disabled: busy || (marks.length === 0 && draft.trim() === ''),
                    onClick: sendAll,
                  },
                  sendLabel,
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshAnnotate__barTool',
                    title: t('bar.exit'),
                    'aria-label': t('bar.exit'),
                    disabled: sendState === 'sending',
                    // Hides the bar only: marks and the unsaved comment stay.
                    onClick: () => {
                      setBarOpen(false);
                      setTrayOpen(false);
                      setPickMode(false);
                    },
                  },
                  h('span', { 'aria-hidden': 'true', className: 'dshAnnotate__barClose' }, '×'),
                ),
              )
            : null,
          barOpen && sendState === 'error' && sendError !== ''
            ? h('div', { className: 'dshAnnotate__barError', role: 'alert' }, sendError)
            : null,
          barOpen && trayOpen
            ? h(
                'div',
                {
                  className: 'dshAnnotate__drawer',
                  style: drawerStyle,
                  // Only when the bar was dragged: this drops the centring
                  // transform so the inline `left` is the real position.
                  'data-anchored': barAt === null ? undefined : '',
                },
                h(
                  'div',
                  { className: 'dshAnnotate__drawerHead' },
                  h('span', { className: 'dshAnnotate__drawerTitle' }, t('drawer.title')),
                  h('span', { className: 'dshAnnotate__drawerCount' }, t('sent.count').replace('%n', String(marks.length))),
                  h('div', { className: 'dshAnnotate__drawerSpacer' }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshAnnotate__drawerBtn',
                      title: t('drawer.close'),
                      'aria-label': t('drawer.close'),
                      onClick: () => setTrayOpen(false),
                    },
                    '×',
                  ),
                ),
                h(
                  'div',
                  { className: 'dshAnnotate__drawerBody' },
                  marks.length === 0
                    ? h('div', { className: 'dshAnnotate__empty' }, t('tray.empty'))
                    : marks.map(markRow),
                  sendState === 'sent'
                    ? h('div', { className: 'dshAnnotate__status', 'data-tone': 'success', role: 'status' }, t('send.sent'))
                    : null,
                ),
              )
            : null,
        ),
      );
    }

    /* -------------------------------------------------------------- sent card */

    /**
     * Parse the Markdown block back into rows for the collapsed card.
     *
     * The card renders from the same text the model receives, so there is one
     * source of truth: reopening a Session re-parses the stored message, and no
     * side table has to be persisted or kept in sync.
     */
    function parseBundleText(raw) {
      const rows = [];
      const lines = String(raw ?? '').split('\n');
      let pageTitle = '';
      let pageUrl = '';
      let current = null;
      // The comment moved into a fenced block so it can carry blank lines; the
      // parser tracks that fence instead of expecting a single-line field.
      let fence = null;
      let fenceOwner = null;
      let fencePending = false;
      const closeFence = () => {
        if (fence === null) return;
        if (fenceOwner !== null) fenceOwner.comment = fence.join('\n');
        fence = null;
        fenceOwner = null;
      };
      for (const line of lines) {
        if (fence !== null) {
          // The first line after the label is the opening fence (possibly with a
          // language tag); it opens, it is not content and not a close.
          if (fencePending) {
            fencePending = false;
            continue;
          }
          if (line.trim().startsWith('```')) {
            closeFence();
            continue;
          }
          fence.push(line);
          continue;
        }
        // Both locales are accepted so a reopened Session renders even when the
        // UI language has changed since the message was sent.
        const title = /^(?:页面标题|Page title)[:：](.+)$/.exec(line);
        if (title !== null) {
          pageTitle = title[1].trim();
          continue;
        }
        const url = /^(?:页面地址|Page URL)[:：](.+)$/.exec(line);
        if (url !== null) {
          pageUrl = url[1].trim();
          continue;
        }
        const head = /^### (\d+)\. (.*)$/.exec(line);
        if (head !== null) {
          current = { n: Number(head[1]), title: head[2].trim(), comment: '', text: '', selector: '' };
          rows.push(current);
          continue;
        }
        if (current === null) continue;
        // Fenced form: `- 用户批注意见：` followed by ```text … ```
        if (/^[-*]\s(?:用户批注意见|User comment)\s*[:：]?\s*$/.test(line.trim())) {
          fence = [];
          fenceOwner = current;
          fencePending = true;
          continue;
        }
        // Legacy inline form, still accepted for messages sent before the fence.
        const comment = /^[-*]\s(?:用户批注意见|User comment)[:：](.*)$/.exec(line);
        if (comment !== null) {
          current.comment = comment[1].trim();
          continue;
        }
        const quoted = /^[-*]\s(?:网页引用文本|Quoted page text)[:：](.*)$/.exec(line);
        if (quoted !== null) {
          current.text = quoted[1].trim();
          continue;
        }
        const selector = /^[-*]\s(?:浏览器定位线索（不是源码路径）|Browser locator \(not a source path\))[:：](.*)$/.exec(line);
        if (selector !== null) current.selector = selector[1].trim();
      }
      // A fence left open at end-of-input still yields its content.
      closeFence();
      return { pageTitle, pageUrl, rows };
    }

    /** One annotation row inside an expanded card. */
    function SentCardRow(props) {
      const { row } = props;
      return h(
        'div',
        { className: 'dshAnnotate__sentRow' },
        h('span', { className: 'dshAnnotate__sentNum' }, String(row.n)),
        h(
          'div',
          { className: 'dshAnnotate__sentRowBody' },
          h('div', { className: 'dshAnnotate__sentComment' }, row.comment),
          row.text === ''
            ? null
            : h('div', { className: 'dshAnnotate__sentQuote' }, row.text),
          row.selector === ''
            ? null
            : h('div', { className: 'dshAnnotate__sentMeta', title: row.selector }, row.selector),
        ),
      );
    }

    /**
     * The annotation card shown in the transcript.
     *
     * Collapsed by default: the title, the count, and the first comments. The
     * full text stays in the message — this is presentation only.
     */
    function SentCard(props) {
      const { raw, t } = props;
      const parsed = React.useMemo(() => parseBundleText(raw), [raw]);
      const [open, setOpen] = React.useState(false);
      const count = parsed.rows.length;
      const preview = parsed.rows
        .slice(0, 3)
        .map((row) => row.comment)
        .filter((value) => value !== '')
        .join(' · ');
      return h(
        'div',
        { className: 'dshAnnotate__sent', 'data-open': open ? 'true' : 'false' },
        h(
          'button',
          {
            type: 'button',
            className: 'dshAnnotate__sentHead',
            'aria-expanded': open,
            onClick: () => setOpen((value) => !value),
          },
          h('span', { className: 'dshAnnotate__sentIcon', 'aria-hidden': 'true' }, '◧'),
          h(
            'span',
            { className: 'dshAnnotate__sentTitle' },
            parsed.pageTitle === '' ? t('sent.title') : parsed.pageTitle,
          ),
          h('span', { className: 'dshAnnotate__sentCount' }, t('sent.count').replace('%n', String(count))),
          h('span', { className: 'dshAnnotate__sentChevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
        ),
        preview === '' || open
          ? null
          : h('div', { className: 'dshAnnotate__sentPreview' }, preview),
        open
          ? h(
              'div',
              { className: 'dshAnnotate__sentBody' },
              parsed.rows.map((row) => h(SentCardRow, { key: String(row.n), row })),
              parsed.pageUrl === ''
                ? null
                : h('div', { className: 'dshAnnotate__sentFoot' }, parsed.pageUrl),
            )
          : null,
      );
    }

    /** The exact text of the bundle starting at `start`, or `''` when invalid. */
    function bundleSliceAt(text, start) {
      if (typeof text !== 'string') return '';
      if (!Number.isInteger(start) || start < 0) return '';
      if (!text.startsWith(BUNDLE_OPEN, start)) return '';
      const close = text.indexOf(BUNDLE_CLOSE, start);
      if (close < 0) return '';
      return text.slice(start, bundleBlockEnd(text, start, close + BUNDLE_CLOSE.length));
    }

    /** Start offsets of every annotation block in a draft, in order. */
    function bundleStarts(text) {
      const starts = [];
      if (typeof text !== 'string') return starts;
      let from = 0;
      for (;;) {
        const at = text.indexOf(BUNDLE_OPEN, from);
        if (at < 0) break;
        starts.push(at);
        const close = text.indexOf(BUNDLE_CLOSE, at);
        if (close < 0) break;
        // Continue past this block so a nested-looking marker inside a comment
        // cannot produce a phantom card.
        const end = bundleBlockEnd(text, at, close + BUNDLE_CLOSE.length);
        from = end > at ? end : close + BUNDLE_CLOSE.length;
      }
      return starts;
    }

    /**
     * Remove exactly one annotation block from a draft.
     *
     * Returns the new draft, or `null` when `start` does not point at a valid
     * bundle — in which case the caller must leave the draft untouched rather
     * than guess. Text before and after the block, including a second bundle,
     * is preserved; only the block itself and the blank line that separated it
     * are removed.
     */
    function removeBundleRange(text, start) {
      if (typeof text !== 'string') return null;
      if (!Number.isInteger(start) || start < 0) return null;
      if (!text.startsWith(BUNDLE_OPEN, start)) return null;
      const close = text.indexOf(BUNDLE_CLOSE, start);
      if (close < 0) return null;
      const end = bundleBlockEnd(text, start, close + BUNDLE_CLOSE.length);
      if (end <= start) return null;
      const head = text.slice(0, start);
      const tail = text.slice(end);
      // Trim the seam only: one blank line between the surrounding text and what
      // follows, so the result does not accumulate empty lines.
      const trimmedHead = head.replace(/\s+$/, '');
      const trimmedTail = tail.replace(/^\s+/, '');
      if (trimmedHead === '') return trimmedTail;
      if (trimmedTail === '') return trimmedHead;
      return trimmedHead + '\n\n' + trimmedTail;
    }

    /* --------------------------------------------------------- draft attachment */

    /**
     * A card for an annotation block that is already present in the composer
     * draft.
     *
     * Scope, stated plainly: this reflects the draft, it does not put anything
     * into it. `inputActions` reaches a plugin only as a Slot prop on
     * `conversation.input.dock`, never as a service, so the browser panel cannot
     * push a bundle into the composer — the plugin's send button calls
     * `conversation.send()` directly instead. What this card therefore covers is
     * the case where a block *is* in the draft (the user pasted it, or a future
     * host version exposes draft writes): it shows each block, and removing one
     * rewrites the draft without it while keeping the user's own words and any
     * other block.
     */
    function DraftAttachmentCard(props) {
      const { draft, inputActions, t, blockStart } = props;
      const [open, setOpen] = React.useState(false);
      // Render from this card's own block, not the whole draft: a second bundle
      // (or the user's own text) must not be counted as this card's items.
      const source = React.useMemo(() => bundleSliceAt(draft, blockStart), [draft, blockStart]);
      const parsed = React.useMemo(() => parseBundleText(source), [source]);
      if (parsed.rows.length === 0) return null;
      const count = parsed.rows.length;
      const preview = parsed.rows
        .slice(0, 3)
        .map((row) => row.comment)
        .filter((value) => value !== '')
        .join(' · ');
      const remove = () => {
        // Cut only this bundle's own range. Slicing to the end of the draft would
        // discard anything the user wrote after the block, and any other bundle
        // sitting behind it.
        const next = removeBundleRange(draft, blockStart);
        if (next === null) return;
        inputActions.setDraft(next);
      };
      return h(
        'div',
        { className: 'dshAnnotate__draft', 'data-open': open ? 'true' : 'false' },
        h(
          'div',
          { className: 'dshAnnotate__draftHead' },
          h(
            'button',
            {
              type: 'button',
              className: 'dshAnnotate__draftToggle',
              'aria-expanded': open,
              onClick: () => setOpen((value) => !value),
            },
            h('span', { className: 'dshAnnotate__sentIcon', 'aria-hidden': 'true' }, '◧'),
            h(
              'span',
              { className: 'dshAnnotate__sentTitle' },
              (parsed.pageTitle === '' ? t('sent.title') : parsed.pageTitle) +
                ' · ' +
                t('sent.count').replace('%n', String(count)),
            ),
            h('span', { className: 'dshAnnotate__sentChevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dshAnnotate__draftRemove',
              title: t('draft.remove'),
              'aria-label': t('draft.remove'),
              onClick: remove,
            },
            '×',
          ),
        ),
        preview === '' || open ? null : h('div', { className: 'dshAnnotate__sentPreview' }, preview),
        open ? h('div', { className: 'dshAnnotate__sentBody' }, parsed.rows.map((row) => h(SentCardRow, { key: String(row.n), row }))) : null,
      );
    }

    /* ------------------------------------------------------------------- apply */

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        const activeLocale = () => {
          try {
            const active = ctx.locale.getLocale()?.active;
            return typeof active === 'string' && active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
          } catch (error) {
            return 'en';
          }
        };

        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'web-annotate: dictionaries');
        ctx.effect(installStyles, 'web-annotate: styles');

        const bridge = globalThis.dshDesktop?.browser;
        if (bridge === undefined || typeof bridge.acquire !== 'function') return;

        /**
         * Deliver one message.
         *
         * The block is identical whether it goes through the composer or the
         * direct Session prompt, so the card and the model context do not depend
         * on which path ran: `uiConversation.userText` matches the text wherever
         * it is rendered from.
         */
        const sendPrompt = async (sessionId, text) => {
          const sessions = ctx.get('sessions');
          if (sessions === undefined) throw new Error('web-annotate: sessions service unavailable');
          const conversation = sessions.scope(sessionId)?.get('conversation');
          if (conversation !== undefined) {
            await conversation.send(text);
            return;
          }
          const session = sessions.binding(sessionId)?.session;
          if (session === undefined) throw new Error('web-annotate: this Session is no longer open');
          const result = await session.prompt([{ type: 'text', text }], 'queue');
          if (result?.ok !== true) throw new Error('web-annotate: the message could not be sent');
        };

        /**
         * Find the annotation block in a submitted message.
         *
         * `uiConversation.userText` matches *display* text and never rewrites
         * what the model receives; the block stays ordinary Markdown in the
         * message, and this rule only decides to render it as a card. That is
         * exactly the split the feature needs: the model keeps every word, the
         * transcript keeps a compact card.
         */
        const ANNOTATION_TEXT_ID = 'annotationBundle';
        ctx.inject(['uiConversation', 'slots'], (conversation) => {
          conversation.effect(
            () =>
              conversation.uiConversation.userText.register({
                id: ANNOTATION_TEXT_ID,
                // Before the whitespace rules so the block is claimed whole.
                order: 5,
                match(text, from) {
                  const start = text.indexOf(BUNDLE_OPEN, from);
                  if (start < 0) return undefined;
                  const close = text.indexOf(BUNDLE_CLOSE, start);
                  if (close < 0) return undefined;
                  // Claim the whole block, not just the marker line: the card
                  // renders from `raw`, so a marker-only range would both leave
                  // the Markdown visible and parse to zero items.
                  const end = bundleBlockEnd(text, start, close + BUNDLE_CLOSE.length);
                  return {
                    id: ANNOTATION_TEXT_ID,
                    start,
                    end,
                    data: { bundleId: bundleIdOf(text, start) },
                  };
                },
              }),
            'web-annotate: annotation text rule',
          );

          conversation.effect(
            () =>
              conversation.slots.register(
                {
                  name: 'conversation.user.text.node',
                  key: ANNOTATION_TEXT_ID,
                  locale: NS,
                  inject: () => ({ t }),
                },
                (props) => h(SentCard, { raw: props.raw, t: props.t }),
              ),
            'web-annotate: annotation card view',
          );

          // The draft card sits above the composer. `input.dock` is an append-only
          // list (`replaceRisk: none`), so this adds a row instead of shadowing a
          // shipped control; the card reads the draft and edits it through
          // `inputActions`, never owning a second copy of the annotations.
          conversation.effect(
            () =>
              conversation.slots.register(
                {
                  name: 'conversation.input.dock',
                  id: 'web-annotate-draft',
                  order: 15,
                  label: () => t('sent.title'),
                  inject: () => ({ t }),
                },
                (props) => {
                  if (props.input === undefined || props.inputActions === undefined) return null;
                  const draft = props.input.draft;
                  const starts = bundleStarts(draft);
                  if (starts.length === 0) return null;
                  // One card per block: a second bundle in the same draft is its
                  // own attachment, with its own remove button.
                  return h(
                    React.Fragment,
                    null,
                    starts.map((start) =>
                      h(DraftAttachmentCard, {
                        key: String(start),
                        draft,
                        blockStart: start,
                        inputActions: props.inputActions,
                        t: props.t,
                      }),
                    ),
                  );
                },
              ),
            'web-annotate: draft attachment card',
          );
        });

        ctx.inject(['sidebarRight', 'sidebarRightTabs'], (sidebar) => {
          // Two registrations, one implementation:
          //
          //  * `browser` is an *extension* registration that takes the builtin
          //    Browser type's slot (an extension shadows the builtin of the same
          //    kind). This is the whole point of the takeover: the guide capsule,
          //    Ctrl+T, chat links opened "in the sidebar", and `openTab('browser')`
          //    all resolve through the kind, so they land here instead of the
          //    plain viewer. It re-declares the guide entry so that one capsule
          //    survives — the builtin's entries disappear with the builtin.
          //
          //  * `web-annotate` stays as a hidden alias: sessions that already
          //    recorded tabs under this kind keep rendering, and any caller that
          //    names the kind still works. It contributes no guide entry of its
          //    own, because the Browser capsule is now the entry point.
          //
          // Removing the takeover restores the shipped Browser untouched.
          const takeover = {
            id: TAKEOVER_ID,
            kind: BROWSER_KIND,
            // Must match the builtin: existing Browser tabs carry its address
            // shape, and the close/persistence rules key off these flags.
            multiple: true,
            keepMounted: true,
            title: () => t('browser.title'),
            guide: [
              {
                id: 'annotate',
                // Same shortcut as the builtin entry, so Ctrl+T still shows on
                // the capsule and still opens this type.
                commandId: 'browser.new',
                order: 30,
                title: () => t('browser.title'),
                description: () => t('browser.guide.description'),
                icon: IconBrowser,
              },
            ],
          };
          sidebar.effect(
            () => sidebar.sidebarRightTabs.register(takeover),
            'web-annotate: browser takeover',
          );

          const alias = {
            id: TAB_ID,
            kind: TAB_KIND,
            multiple: true,
            keepMounted: true,
            title: () => t('tab.title'),
          };
          sidebar.effect(() => sidebar.sidebarRightTabs.register(alias), 'web-annotate: tab type');

          sidebar.slots.inject('sidebar.right.pane.tab', () =>
            sidebar.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: TAKEOVER_ID,
                locale: NS,
                inject: () => ({ t, activeLocale, sendPrompt }),
              },
              AnnotateBody,
            ),
          );

          // The same body under the alias id: a kind renders through the id of
          // the registration in force, so both kinds need a cell.
          sidebar.slots.inject('sidebar.right.pane.tab', () =>
            sidebar.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: TAB_ID,
                locale: NS,
                inject: () => ({ t, activeLocale, sendPrompt }),
              },
              AnnotateBody,
            ),
          );
        });
      },
    };
  },
});
