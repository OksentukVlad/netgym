export function maskExample() {
  return {
    context: 'Адреса 198.51.100.77/26: блок із 64 адрес починається на 64 й закінчується на 127.',
    columns: ['Адреса', 'Мережа', 'Broadcast'],
    rows: [['198.51.100.77/26', '198.51.100.64', '198.51.100.127']],
    ruler: { min: 0, max: 255, value: 77, start: 64, end: 127, blockSize: 64, labelStep: 32, prefix: 26 },
    task: { kind: 'block', ip: '198.51.100.77', prefix: 26 },
    answer: { network: '198.51.100.64', broadcast: '198.51.100.127' },
  };
}
