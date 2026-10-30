const phaseChoices = [
  { id: 'preorder', label: '预约期' },
  { id: 'launch', label: '测试与首发期' },
];

/** Keep the phase navigation outside the existing module's rerendered content. */
export async function mountPhaseWorkbench(content, {
  kind,
  phase = 'preorder',
  title,
  mount,
  isActive = () => true,
  selectedJobId = '',
  onPhaseChange = () => {},
}) {
  const selectedPhase = phase === 'launch' ? 'launch' : 'preorder';
  const label = kind === 'icon' ? 'ICON改尺寸工作台' : '商店图改尺寸工作台';
  const shell = document.createElement('div');
  shell.className = 'phase-workbench';
  shell.dataset.phaseKind = kind === 'icon' ? 'icon' : 'store';
  shell.dataset.phase = selectedPhase;

  const navigation = document.createElement('div');
  navigation.className = 'phase-workbench-navigation';
  const heading = document.createElement('h2');
  heading.className = 'phase-workbench-title';
  heading.textContent = label;
  const tabs = document.createElement('div');
  tabs.className = 'phase-workbench-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${label}制作阶段`);

  const inner = document.createElement('div');
  inner.className = 'phase-workbench-content';
  inner.id = `phase-workbench-${shell.dataset.phaseKind}-${selectedPhase}`;
  inner.setAttribute('role', 'tabpanel');
  inner.setAttribute('aria-labelledby', `${inner.id}-tab`);
  const active = () => shell.isConnected && shell.parentElement === content && isActive();

  for (const choice of phaseChoices) {
    const button = document.createElement('button');
    const selected = choice.id === selectedPhase;
    button.type = 'button';
    button.className = selected ? 'active' : '';
    button.dataset.workbenchPhase = choice.id;
    button.id = `phase-workbench-${shell.dataset.phaseKind}-${choice.id}-tab`;
    button.textContent = choice.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    if (selected) button.setAttribute('aria-controls', inner.id);
    button.tabIndex = selected ? 0 : -1;
    button.addEventListener('click', () => {
      if (choice.id !== selectedPhase && active()) onPhaseChange(choice.id);
    });
    tabs.append(button);
  }

  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });

  navigation.append(heading, tabs);
  shell.append(navigation, inner);
  content.replaceChildren(shell);
  if (title) title.textContent = label;

  // The shell owns the single type heading; module rendering keeps its stage
  // information and uses this detached node for legacy title updates.
  const moduleTitle = document.createElement('span');
  await mount(inner, moduleTitle, active, selectedJobId);
  return { shell, inner, isActive: active };
}
