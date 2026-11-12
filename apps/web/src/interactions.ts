/// <reference lib="dom" />
// Functional dialogs reuse the supplied console's card, typography and button styles.
// No external HTML or provider payload is interpreted as markup.
export interface Field {
  key: string;
  label: string;
  value?: string;
  choices?: string[];
  required?: boolean;
}
const panelStyle =
  'background:#fbfafd;color:#15131d;border:1px solid rgba(21,19,29,.09);border-radius:24px;padding:24px;max-width:640px;width:calc(100% - 48px);box-sizing:border-box;font:400 14px/1.5 Geist,sans-serif;max-height:90vh;overflow:auto';
const buttonStyle =
  'appearance:none;cursor:pointer;border:1px solid rgba(21,19,29,.2);padding:12px 18px;border-radius:999px;font:600 14px Geist,sans-serif;background:transparent;color:#15131d';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, content?: string) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  return node;
}
export async function review(input: {
  title: string;
  text: string;
  approve: string;
  fields?: Field[];
  attachment?: () => Promise<void>;
}): Promise<Record<string, string> | null> {
  const dialog = element('dialog');
  dialog.style.cssText = panelStyle;
  const form = element('form');
  form.method = 'dialog';
  const heading = element('h2', input.title);
  heading.style.cssText =
    'font:500 24px/1.1 Geist,sans-serif;letter-spacing:-.035em;margin:0 0 18px';
  const text = element('pre', input.text);
  text.style.cssText =
    'white-space:pre-wrap;overflow-wrap:anywhere;font:400 13px/1.5 "Geist Mono",monospace';
  form.append(heading, text);
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const field of input.fields ?? []) {
    const label = element('label', field.label);
    label.style.cssText = 'display:block;margin:12px 0';
    const control = field.choices ? element('select') : element('input');
    control.name = field.key;
    control.required = field.required ?? false;
    control.style.cssText =
      'display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:10px 12px;border:1px solid rgba(21,19,29,.2);border-radius:12px;background:#f3f1f6;color:#15131d;font:inherit';
    if (control instanceof HTMLSelectElement)
      for (const choice of field.choices ?? []) control.add(new Option(choice, choice));
    control.value = field.value ?? field.choices?.[0] ?? '';
    label.append(control);
    form.append(label);
    controls.set(field.key, control);
  }
  const actions = element('div');
  actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:18px';
  if (input.attachment) {
    const attachment = element('button', 'Download exact evidence PDF');
    attachment.type = 'button';
    attachment.style.cssText = buttonStyle;
    attachment.onclick = async () => {
      attachment.disabled = true;
      try {
        await input.attachment!();
      } catch {
        attachment.textContent = 'PDF unavailable — close and refresh';
      } finally {
        attachment.disabled = false;
      }
    };
    actions.append(attachment);
  }
  const cancel = element('button', 'Cancel');
  cancel.type = 'button';
  cancel.style.cssText = buttonStyle;
  cancel.onclick = () => dialog.close('cancel');
  const approve = element('button', input.approve);
  approve.type = 'submit';
  approve.style.cssText = buttonStyle + ';background:oklch(0.53 0.23 295);color:#fff;border:0';
  actions.append(cancel, approve);
  form.append(actions);
  dialog.append(form);
  document.body.append(dialog);
  const result = await new Promise<Record<string, string> | null>((resolve) => {
    let accepted = false;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      accepted = true;
      dialog.close();
    });
    dialog.addEventListener(
      'close',
      () =>
        resolve(
          accepted
            ? Object.fromEntries([...controls].map(([key, control]) => [key, control.value.trim()]))
            : null,
        ),
      { once: true },
    );
    dialog.showModal();
  });
  dialog.remove();
  return result;
}

/** Fresh camera pixels only. Permission failure/cancel never becomes a successful upload. */
export async function capturePhoto(label: string): Promise<Blob | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNAVAILABLE');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  const dialog = element('dialog');
  dialog.style.cssText = panelStyle;
  const video = element('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  video.style.cssText = 'width:100%;border-radius:14px;background:#15131d';
  const capture = element('button', 'Capture ' + label);
  capture.style.cssText = buttonStyle;
  const cancel = element('button', 'Cancel');
  cancel.style.cssText = buttonStyle;
  dialog.append(element('h2', label), video, capture, cancel);
  document.body.append(dialog);
  try {
    dialog.showModal();
    await video.play();
    return await new Promise<Blob | null>((resolve, reject) => {
      dialog.addEventListener('close', () => resolve(null), { once: true });
      cancel.onclick = () => dialog.close();
      capture.onclick = async () => {
        capture.disabled = true;
        const canvas = element('canvas');
        if (!video.videoWidth || !video.videoHeight) {
          capture.disabled = false;
          return;
        }
        const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('CAMERA_UNAVAILABLE'));
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('CAPTURE_FAILED'))),
          'image/jpeg',
          0.92,
        );
      };
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    dialog.remove();
  }
}

export async function downloadPdf(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
