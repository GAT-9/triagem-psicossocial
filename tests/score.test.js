'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { allItems, score } = require('../triagem.js');

const items = allItems();
const all = (v, over = {}) => Object.assign(Object.fromEntries(items.map((i) => [i.id, v])), over);

test('os pesos somam 100 e as 17 perguntas têm ids únicos', () => {
  assert.equal(items.length, 17);
  assert.equal(new Set(items.map((i) => i.id)).size, 17);
  assert.equal(items.reduce((s, i) => s + i.weight, 0), 100);
});

test('extremos: tudo 0 dá 0 e baixo; tudo 10 dá 100 e alto', () => {
  const zero = score(all(0));
  assert.equal(zero.total, 0);
  assert.equal(zero.category, 'baixo');
  assert.equal(zero.top.length, 0);
  assert.equal(zero.showSupport, false);
  const max = score(all(10));
  assert.equal(max.total, 100);
  assert.equal(max.category, 'alto');
});

test('cada resposta altera o total na medida exata do seu próprio peso', () => {
  for (const it of items) {
    const r = score(all(0, { [it.id]: 10 }));
    assert.equal(r.total, it.weight, it.id);
    assert.equal(score(all(0, { [it.id]: 5 })).total, it.weight / 2, it.id);
  }
});

test('o mesmo valor em perguntas diferentes rende pontos diferentes', () => {
  assert.notEqual(score(all(0, { R1: 7 })).total, score(all(0, { J1: 7 })).total);
});

test('pontos de corte da soma são exatos, sem erro de ponto flutuante', () => {
  // 25,0 pontos exatos: D1=10 (6) + D2=10 (7) + A1=10 (7) + A3=10 (5)
  assert.equal(score(all(0, { D1: 10, D2: 10, A1: 10, A3: 10 })).categoryBySum, 'moderado');
  // 24,8: uma pequena redução fica abaixo do corte
  assert.equal(score(all(0, { D1: 10, D2: 10, A1: 10, A3: 9, J1: 1 })).total, 24.8);
  assert.equal(score(all(0, { D1: 10, D2: 10, A1: 10, A3: 9, J1: 1 })).categoryBySum, 'baixo');
  // 50,0 exatos: depressão inteira (22) + ansiedade inteira (18) + V1 (6) + S1 (4)
  const fifty = score(all(0, { D1: 10, D2: 10, D3: 10, D4: 10, A1: 10, A2: 10, A3: 10, V1: 10, S1: 10 }));
  assert.equal(fifty.total, 50);
  assert.equal(fifty.categoryBySum, 'alto');
});

test('regra de segurança: R1 sobe a categoria mesmo com soma baixa', () => {
  const r1 = score(all(0, { R1: 1 }));
  assert.equal(r1.total, 1.4);
  assert.equal(r1.categoryBySum, 'baixo');
  assert.equal(r1.category, 'moderado');
  assert.equal(r1.raisedByRule, true);
  assert.equal(r1.showSupport, true);
  assert.equal(score(all(0, { R1: 2 })).category, 'moderado');
  assert.equal(score(all(0, { R1: 3 })).category, 'alto');
});

test('regra de segurança: R3 e R2', () => {
  assert.equal(score(all(0, { R3: 1 })).category, 'moderado');
  assert.equal(score(all(0, { R3: 4 })).category, 'moderado');
  assert.equal(score(all(0, { R3: 5 })).category, 'alto');
  assert.equal(score(all(0, { R2: 4 })).category, 'baixo');
  assert.equal(score(all(0, { R2: 5 })).category, 'moderado');
  assert.equal(score(all(0, { R2: 4 })).showSupport, false);
  assert.equal(score(all(0, { R2: 5 })).showSupport, true);
});

test('piso moderado nunca rebaixa um resultado já alto', () => {
  const r = score(all(0, { R1: 3, D1: 10, D2: 10, D3: 10, D4: 10 }));
  assert.equal(r.category, 'alto');
});

test('fator clínico a 70% ou mais garante ao menos moderado', () => {
  const dep = (v) => all(0, { D1: v, D2: v, D3: v, D4: v });
  assert.equal(score(dep(6)).category, 'baixo');
  assert.equal(score(dep(7)).category, 'moderado');
  assert.equal(score(all(0, { A1: 7, A2: 7, A3: 7 })).total, 12.6);
  assert.equal(score(all(0, { A1: 7, A2: 7, A3: 7 })).category, 'moderado');
  assert.equal(score(all(0, { V1: 7, V2: 7, V3: 7 })).category, 'moderado');
  assert.equal(score(all(0, { S1: 10, S2: 10 })).category, 'baixo');
});

test('fatores mais influentes vêm ordenados por pontos e limitados a 3', () => {
  const r = score(all(0, { J2: 10, D2: 10, A1: 5, V1: 1 }));
  assert.deepEqual(r.top.map((f) => f.factor.id), ['depressao', 'apostas', 'ansiedade']);
  assert.equal(r.top[0].top.item.id, 'D2');
});

test('orientações adicionais dependem do fator', () => {
  assert.equal(score(all(0, { V1: 4, V2: 4, V3: 4 })).addons.length, 0);
  assert.match(score(all(0, { V1: 5, V2: 5, V3: 5 })).addons[0], /assistência social/);
  assert.match(score(all(0, { J1: 5, J2: 5 })).addons[0], /aposta/);
  assert.match(score(all(0, { S1: 5, S2: 5 })).addons[0], /sono/);
});

test('o encaminhamento segue a categoria e nenhum texto afirma diagnóstico', () => {
  assert.match(score(all(0)).referral, /acompanhamento habitual/);
  assert.match(score(all(0, { R1: 1 })).referral, /agendamento breve/);
  assert.match(score(all(10)).referral, /com prioridade/);
  for (const r of [score(all(0)), score(all(0, { R1: 1 })), score(all(10))]) {
    assert.doesNotMatch(r.referral, /você tem|diagnóstico de|depressão|transtorno/i);
  }
});
