'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../triagem.js');
const exporter = require('../export.js');

const answers = Object.fromEntries(core.allItems().map((i) => [i.id, 0]));
const patient = { nome: 'Pessoa Fictícia', nascimento: '1990-06-15', dataTriagem: '2026-11-04', cns: '', telefone: '', profissional: '', observacoes: '' };
const report = (p = patient, a = answers) => exporter.buildReport(p, core.score(a), core.CATEGORY_LABEL);

test('validação: nome e nascimento são obrigatórios', () => {
  const e = core.validatePatient({ nome: ' ', nascimento: '', dataTriagem: '2026-11-04' }, '2026-11-04');
  assert.ok(e.nome);
  assert.ok(e.nascimento);
  assert.deepEqual(core.validatePatient(patient, '2026-11-04'), {});
});

test('validação: datas impossíveis são recusadas', () => {
  assert.ok(core.validatePatient({ ...patient, nascimento: '2030-01-01' }, '2026-11-04').nascimento);
  assert.ok(core.validatePatient({ ...patient, nascimento: '1800-01-01' }, '2026-11-04').nascimento);
  assert.ok(core.validatePatient({ ...patient, dataTriagem: '1980-01-01' }, '2026-11-04').dataTriagem);
});

test('validação: Cartão SUS e telefone só quando preenchidos', () => {
  assert.ok(core.validatePatient({ ...patient, cns: '123' }, '2026-11-04').cns);
  assert.equal(core.validatePatient({ ...patient, cns: '123 4567 8901 2345' }, '2026-11-04').cns, undefined);
  assert.ok(core.validatePatient({ ...patient, telefone: '99' }, '2026-11-04').telefone);
  assert.equal(core.validatePatient({ ...patient, telefone: '(75) 99999-0000' }, '2026-11-04').telefone, undefined);
});

test('idade considera se o aniversário já passou', () => {
  assert.equal(exporter.ageAt('1990-11-04', '2026-11-04'), 36);
  assert.equal(exporter.ageAt('1990-11-05', '2026-11-04'), 35);
  assert.equal(exporter.ageAt('1990-12-01', '2026-11-04'), 35);
});

test('relatório omite campos vazios e traz todas as respostas', () => {
  const r = report();
  assert.deepEqual(r.patientRows.map((x) => x[0]), ['Nome', 'Data de nascimento', 'Idade na triagem', 'Data da triagem']);
  assert.equal(r.answers.length, 17);
  assert.equal(exporter.formatDate('2026-11-04'), '04/11/2026');
});

test('CRC-32 confere com o valor de referência', () => {
  assert.equal(exporter.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('planilha é um ZIP com os arquivos esperados', () => {
  const bytes = exporter.buildXlsx(report());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('utf8');
  for (const name of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml', 'xl/charts/chart1.xml', 'xl/drawings/drawing1.xml']) {
    assert.ok(text.includes(name), name);
  }
});

test('planilha neutraliza XML e fórmulas digitados pelo usuário', () => {
  const text = Buffer.from(exporter.buildXlsx(report({ ...patient, nome: '=HYPERLINK("x") <b>&\u0007' }))).toString('utf8');
  assert.ok(text.includes('=HYPERLINK(&quot;x&quot;) &lt;b&gt;&amp;'));
  assert.ok(!text.includes('<f>'));
  assert.ok(!text.includes('&amp;\u0007'));
});

test('relatório traz os 6 fatores em ordem de pontos, com soma igual ao total', () => {
  const r = report(patient, { ...answers, D2: 10, R1: 10, J2: 5 });
  assert.equal(r.factors.length, 6);
  assert.deepEqual(r.factors.slice(0, 3).map((f) => f.label), ['Risco imediato', 'Sintomas de depressão', 'Jogos de aposta']);
  assert.equal(r.factors.reduce((s, f) => s + f.points * 10, 0) / 10, r.total);
  assert.equal(r.factors.reduce((s, f) => s + f.max, 0), 100);
});
