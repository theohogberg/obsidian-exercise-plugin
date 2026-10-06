// Test stand-in for the `obsidian` module (aliased in vitest.config.ts). The real
// module only exists inside the Obsidian app. Logic tests use moment, normalizePath,
// Notice and requestUrl; rendering tests (happy-dom) also use the UI classes below,
// which produce the same markup Obsidian does so CSS selectors and structure match.
import momentLib from 'moment';

export const moment = momentLib;

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '') || '/';
}

/** Every Notice shown, newest last. Tests may clear it. */
export const notices: string[] = [];
export class Notice {
  constructor(message: string) { notices.push(message); }
}

type RequestUrlHandler = (url: string) => Promise<{ status: number; arrayBuffer: ArrayBuffer }>;
let requestUrlHandler: RequestUrlHandler = () => Promise.reject(new Error('requestUrl: no handler set in test'));
/** Replace what requestUrl returns (simulated network). */
export function setRequestUrlHandler(handler: RequestUrlHandler): void { requestUrlHandler = handler; }
export async function requestUrl(req: { url: string } | string) {
  return requestUrlHandler(typeof req === 'string' ? req : req.url);
}

export class TFile { constructor(public path: string) {} }

/** Which app is running. Tests may change these flags. */
export const Platform = { isDesktopApp: false, isMobile: false, isPhone: false };

// ---------------------------------------------------------------------------
// DOM helpers Obsidian adds to every element (only when a DOM is present)

type DomInfo = string | { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean>; type?: string; value?: string; placeholder?: string; title?: string };

function applyInfo(el: HTMLElement, o?: DomInfo) {
  if (!o) return;
  if (typeof o === 'string') { if (o) el.className = o; return; }
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.type) el.setAttribute('type', o.type);
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  if (o.placeholder) el.setAttribute('placeholder', o.placeholder);
  if (o.title) el.setAttribute('title', o.title);
  for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, String(v));
}

if (typeof HTMLElement !== 'undefined') {
  const proto = Node.prototype as unknown as Record<string, unknown>;
  const elProto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.createEl = function (this: Node, tag: string, o?: DomInfo) {
    const el = document.createElement(tag);
    applyInfo(el, o);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (this: Node, o?: DomInfo) { return (this as unknown as { createEl: (t: string, o?: DomInfo) => HTMLElement }).createEl('div', o); };
  proto.createSpan = function (this: Node, o?: DomInfo) { return (this as unknown as { createEl: (t: string, o?: DomInfo) => HTMLElement }).createEl('span', o); };
  proto.empty = function (this: Node) { while (this.firstChild) this.removeChild(this.firstChild); };
  proto.appendText = function (this: Node, text: string) { this.appendChild(document.createTextNode(text)); };
  proto.setText = function (this: Node, text: string) { this.textContent = text; };
  elProto.addClass = function (this: HTMLElement, ...cls: string[]) { this.classList.add(...cls); };
  elProto.removeClass = function (this: HTMLElement, ...cls: string[]) { this.classList.remove(...cls); };
  elProto.toggleClass = function (this: HTMLElement, cls: string, value: boolean) { this.classList.toggle(cls, value); };
}

function div(cls?: string): HTMLDivElement {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  return el;
}

/** Renders a marker <svg> so tests can see which icon was set. */
export function setIcon(parent: HTMLElement, icon: string): void {
  parent.replaceChildren();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `svg-icon lucide-${icon}`);
  svg.setAttribute('data-icon', icon);
  parent.appendChild(svg);
}

// ---------------------------------------------------------------------------
// UI classes

export class Component {
  registerInterval(id: number): number { return id; }
  register(): void {}
}

export class Plugin extends Component {
  constructor(public app: unknown) { super(); }
}

export class PluginSettingTab {
  containerEl = div();
  constructor(public app: unknown, public plugin: unknown) {}
}

export class WorkspaceLeaf {}

export class ItemView extends Component {
  contentEl = div('view-content');
  app: unknown;
  constructor(public leaf: { app?: unknown; openFile?: (f: unknown) => Promise<void> }) {
    super();
    this.app = leaf.app;
  }
}

/** Every Modal currently open, oldest first. */
export const openModals: Modal[] = [];
export class Modal {
  contentEl = div('modal-content');
  constructor(public app: unknown) {}
  open(): void {
    openModals.push(this);
    void (this as unknown as { onOpen?: () => unknown }).onOpen?.();
  }
  close(): void {
    const i = openModals.indexOf(this);
    if (i >= 0) openModals.splice(i, 1);
    void (this as unknown as { onClose?: () => unknown }).onClose?.();
  }
}

export class FuzzySuggestModal<T> extends Modal {
  placeholder = '';
  setPlaceholder(p: string): void { this.placeholder = p; }
  /** Test helper: choose an item as if the user picked it. */
  choose(item: T): void {
    (this as unknown as { onChooseItem: (i: T) => void }).onChooseItem(item);
    this.close();
  }
}

class ValueComponent<T> {
  protected handler?: (v: T) => unknown;
  onChange(cb: (v: T) => unknown): this { this.handler = cb; return this; }
}

class TextComponent extends ValueComponent<string> {
  inputEl: HTMLInputElement;
  constructor(parent: HTMLElement) {
    super();
    this.inputEl = parent.createEl('input', { type: 'text' });
    this.inputEl.addEventListener('input', () => { void this.handler?.(this.inputEl.value); });
  }
  setValue(v: string): this { this.inputEl.value = v; return this; }
  getValue(): string { return this.inputEl.value; }
  setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this; }
}

class TextAreaComponent extends ValueComponent<string> {
  inputEl: HTMLTextAreaElement;
  constructor(parent: HTMLElement) {
    super();
    this.inputEl = parent.createEl('textarea');
    this.inputEl.addEventListener('input', () => { void this.handler?.(this.inputEl.value); });
  }
  setValue(v: string): this { this.inputEl.value = v; return this; }
  setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this; }
}

class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  constructor(parent: HTMLElement) {
    super();
    this.selectEl = parent.createEl('select', 'dropdown');
    this.selectEl.addEventListener('change', () => { void this.handler?.(this.selectEl.value); });
  }
  addOption(value: string, display: string): this { this.selectEl.createEl('option', { value, text: display }); return this; }
  setValue(v: string): this { this.selectEl.value = v; return this; }
}

class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement;
  private value = false;
  constructor(parent: HTMLElement) {
    super();
    this.toggleEl = parent.createDiv('checkbox-container');
    this.toggleEl.addEventListener('click', () => { this.setValue(!this.value); void this.handler?.(this.value); });
  }
  setValue(v: boolean): this { this.value = v; this.toggleEl.toggleClass('is-enabled', v); return this; }
}

class ButtonComponent {
  buttonEl: HTMLButtonElement;
  constructor(parent: HTMLElement) { this.buttonEl = parent.createEl('button'); }
  setButtonText(t: string): this { this.buttonEl.textContent = t; return this; }
  setCta(): this { this.buttonEl.addClass('mod-cta'); return this; }
  setWarning(): this { this.buttonEl.addClass('mod-warning'); return this; }
  setIcon(icon: string): this { setIcon(this.buttonEl, icon); return this; }
  setTooltip(t: string): this { this.buttonEl.setAttribute('aria-label', t); return this; }
  setDisabled(d: boolean): this { this.buttonEl.disabled = d; return this; }
  onClick(cb: () => unknown): this { this.buttonEl.addEventListener('click', () => { void cb(); }); return this; }
}

class ExtraButtonComponent {
  extraSettingsEl: HTMLElement;
  constructor(parent: HTMLElement) { this.extraSettingsEl = parent.createDiv('clickable-icon extra-setting-button'); }
  setIcon(icon: string): this { setIcon(this.extraSettingsEl, icon); return this; }
  setTooltip(t: string): this { this.extraSettingsEl.setAttribute('aria-label', t); return this; }
  onClick(cb: () => unknown): this { this.extraSettingsEl.addEventListener('click', () => { void cb(); }); return this; }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv('setting-item');
    this.infoEl = this.settingEl.createDiv('setting-item-info');
    this.nameEl = this.infoEl.createDiv('setting-item-name');
    this.descEl = this.infoEl.createDiv('setting-item-description');
    this.controlEl = this.settingEl.createDiv('setting-item-control');
  }
  setName(n: string): this { this.nameEl.textContent = n; return this; }
  setDesc(d: string): this { this.descEl.textContent = d; return this; }
  setHeading(): this { this.settingEl.addClass('setting-item-heading'); return this; }
  addText(cb: (c: TextComponent) => unknown): this { cb(new TextComponent(this.controlEl)); return this; }
  addTextArea(cb: (c: TextAreaComponent) => unknown): this { cb(new TextAreaComponent(this.controlEl)); return this; }
  addDropdown(cb: (c: DropdownComponent) => unknown): this { cb(new DropdownComponent(this.controlEl)); return this; }
  addToggle(cb: (c: ToggleComponent) => unknown): this { cb(new ToggleComponent(this.controlEl)); return this; }
  addButton(cb: (c: ButtonComponent) => unknown): this { cb(new ButtonComponent(this.controlEl)); return this; }
  addExtraButton(cb: (c: ExtraButtonComponent) => unknown): this { cb(new ExtraButtonComponent(this.controlEl)); return this; }
}

// Type-only exports the plugin imports
export type App = unknown;
export type IconName = string;
