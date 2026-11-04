/* Triagem psicossocial: protótipo. Nada aqui é validado clinicamente. */
(function () {
  'use strict';

  /*
   * Cada pergunta tem um peso próprio. Ela vale (resposta / 10) x peso pontos, e os
   * pesos somam 100. Assim, o mesmo valor 7 rende pontos diferentes em cada pergunta.
   */
  var FACTORS = [
    {
      id: 'depressao', label: 'Sintomas de depressão', window: 'Nas últimas 2 semanas, com que frequência isto incomodou?',
      low: 'nunca', high: 'quase todos os dias',
      items: [
        { id: 'D1', weight: 6, source: 'PHQ-9, item 1', text: 'Pouco interesse ou pouco prazer em fazer as coisas' },
        { id: 'D2', weight: 7, source: 'PHQ-9, item 2', text: 'Se sentir “para baixo”, deprimido/a ou sem perspectiva' },
        { id: 'D3', weight: 5, source: 'PHQ-9, item 6', text: 'Se sentir mal consigo mesmo/a, ou achar que é um fracasso ou que decepcionou sua família ou você mesmo/a' },
        { id: 'D4', weight: 4, source: 'PHQ-9, item 4', text: 'Se sentir cansado/a ou com pouca energia' }
      ]
    },
    {
      id: 'ansiedade', label: 'Sintomas de ansiedade', window: 'Na última semana, quanto isto se aplicou a você?',
      low: 'não se aplicou', high: 'aplicou-se muito',
      items: [
        { id: 'A1', weight: 7, source: 'DASS-21, item 15', text: 'Senti que ia entrar em pânico' },
        { id: 'A2', weight: 6, source: 'DASS-21, item 20', text: 'Senti medo sem motivo' },
        { id: 'A3', weight: 5, source: 'DASS-21, item 4', text: 'Tive dificuldade em respirar em alguns momentos, sem ter feito esforço físico' }
      ]
    },
    {
      id: 'sono', label: 'Sono', window: 'Nas últimas 2 semanas, com que frequência isto aconteceu?',
      low: 'nunca', high: 'sempre',
      items: [
        { id: 'S1', weight: 4, source: 'Miniquestionário de Sono, item 2', text: 'Você acorda de madrugada e não consegue adormecer de novo?' },
        { id: 'S2', weight: 3, source: 'Miniquestionário de Sono, item 5', text: 'Ao acordar de manhã, você ainda se sente cansado(a)?' }
      ]
    },
    {
      id: 'apostas', label: 'Jogos de aposta', window: 'Nos últimos 12 meses, com que frequência isto aconteceu?',
      low: 'nunca', high: 'quase sempre',
      items: [
        { id: 'J1', weight: 3, source: 'PGSI, item 1', text: 'Você apostou mais do que podia perder?' },
        { id: 'J2', weight: 4, source: 'PGSI, item 7', text: 'Suas apostas causaram problemas financeiros?' }
      ]
    },
    {
      id: 'vulnerabilidade', label: 'Vulnerabilidade social', window: 'No último mês, quanto isto aconteceu?',
      low: 'não aconteceu', high: 'o tempo todo',
      items: [
        { id: 'V1', weight: 6, source: 'Elaborado para o protótipo', text: 'Faltou dinheiro para comida, contas ou remédios' },
        { id: 'V2', weight: 5, source: 'Elaborado para o protótipo', text: 'Tive medo de perder o lugar onde moro, ou moro em condições inseguras' },
        { id: 'V3', weight: 5, source: 'Elaborado para o protótipo', text: 'Senti que não tinha com quem contar quando precisei' }
      ]
    },
    {
      id: 'risco', label: 'Risco imediato', window: 'Estas perguntas ajudam o serviço a priorizar quem precisa de atenção mais rápida.',
      items: [
        { id: 'R1', weight: 14, source: 'PHQ-9, item 9', low: 'nunca', high: 'quase todos os dias', support: true, text: 'Nas últimas 2 semanas: pensar em se ferir de alguma maneira ou que seria melhor estar morto/a' },
        { id: 'R2', weight: 6, source: 'DASS-21, item 21', low: 'não se aplicou', high: 'aplicou-se muito', support: true, text: 'Na última semana: senti que a vida não tinha sentido' },
        { id: 'R3', weight: 10, source: 'Elaborado para o protótipo', low: 'não se aplica', high: 'aplica-se totalmente', support: true, text: 'Neste momento: sinto que não estou em segurança, por mim ou por causa de outra pessoa' }
      ]
    }
  ];

  var CATEGORY_LABEL = { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto' };

  /* Pontos de corte sobre o total de 0 a 100 */
  var CUT_MODERATE = 25;
  var CUT_HIGH = 50;
  /* A partir desta porcentagem, o fator sozinho garante ao menos "moderado" */
  var FACTOR_FLOOR_PCT = 70;
  var FLOOR_FACTORS = ['depressao', 'ansiedade', 'vulnerabilidade'];
  /* A partir desta porcentagem, o fator acrescenta uma orientação ao encaminhamento */
  var ADDON_PCT = 50;

  var ADDONS = {
    vulnerabilidade: 'Pode ser útil incluir orientação da assistência social, como o CRAS da região.',
    apostas: 'Pode ser útil conversar com a equipe sobre os hábitos de aposta, dentro da Rede de Atenção Psicossocial.',
    sono: 'Pode ser útil incluir uma conversa sobre a rotina de sono na avaliação.'
  };

  var REFERRAL = {
    baixo: 'Sugere-se manter o acompanhamento habitual e procurar o serviço se a situação mudar ou se houver interesse em conversar com a equipe.',
    moderado: 'Recomenda-se avaliação presencial no serviço, com agendamento breve, para compreender melhor a situação.',
    alto: 'Recomenda-se avaliação presencial no serviço com prioridade, de preferência ainda hoje.'
  };

  function allItems() {
    var list = [];
    FACTORS.forEach(function (f) {
      f.items.forEach(function (it) { list.push(it); });
    });
    return list;
  }

  /* answers: { D1: 0..10, ... }. Soma em décimos de ponto, para evitar erro de ponto flutuante. */
  function score(answers) {
    var totalTenths = 0;

    var factors = FACTORS.map(function (f, order) {
      var tenths = 0;
      var maxTenths = 0;
      var top = null;
      var items = f.items.map(function (it) {
        var value = answers[it.id];
        var t = value * it.weight;
        tenths += t;
        maxTenths += 10 * it.weight;
        if (t > 0 && (!top || t > top.tenths)) top = { item: it, value: value, tenths: t };
        return { item: it, value: value, points: t / 10 };
      });
      totalTenths += tenths;
      return {
        factor: f, order: order, items: items, top: top,
        points: tenths / 10, maxPoints: maxTenths / 10,
        pct: Math.round((tenths / maxTenths) * 100),
        exceeds: function (pct) { return tenths * 100 >= maxTenths * pct; }
      };
    });

    var cat = totalTenths >= CUT_HIGH * 10 ? 'alto' : totalTenths >= CUT_MODERATE * 10 ? 'moderado' : 'baixo';
    var bySum = cat;
    var reasons = [];

    function floor(level, why) {
      if (level === 'alto' || cat === 'baixo') cat = level;
      reasons.push(why);
    }

    FLOOR_FACTORS.forEach(function (id) {
      var f = factors.filter(function (x) { return x.factor.id === id; })[0];
      if (f.exceeds(FACTOR_FLOOR_PCT)) floor('moderado', f.factor.label + ' ficou em ' + f.pct + '% do máximo do fator.');
    });

    /* R1 >= 3 corresponde a cerca de "vários dias" na escala original do PHQ-9 (1 de 3). */
    if (answers.R1 >= 3) floor('alto', 'A resposta sobre pensar em se ferir foi 3 ou mais.');
    else if (answers.R1 >= 1) floor('moderado', 'A resposta sobre pensar em se ferir foi maior que zero.');
    if (answers.R3 >= 5) floor('alto', 'A resposta sobre segurança neste momento foi 5 ou mais.');
    else if (answers.R3 >= 1) floor('moderado', 'A resposta sobre segurança neste momento foi maior que zero.');
    if (answers.R2 >= 5) floor('moderado', 'A resposta sobre a vida não ter sentido foi 5 ou mais.');

    var ranked = factors
      .filter(function (f) { return f.points > 0; })
      .sort(function (a, b) { return b.points - a.points || b.pct - a.pct || a.order - b.order; });

    var addons = factors
      .filter(function (f) { return ADDONS[f.factor.id] && f.exceeds(ADDON_PCT); })
      .map(function (f) { return ADDONS[f.factor.id]; });

    return {
      total: totalTenths / 10,
      category: cat,
      categoryBySum: bySum,
      raisedByRule: cat !== bySum,
      reasons: reasons,
      factors: factors,
      top: ranked.slice(0, 3),
      referral: REFERRAL[cat],
      addons: addons,
      showSupport: answers.R1 >= 1 || answers.R3 >= 1 || answers.R2 >= 5
    };
  }

  /* Dados do paciente. Datas em AAAA-MM-DD; devolve { campo: mensagem }. */
  function validatePatient(p, today) {
    var errors = {};
    var digits = function (v) { return (v || '').replace(/\D/g, ''); };
    var isDate = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(Date.parse(v)); };
    if (!(p.nome || '').trim()) errors.nome = 'Informe o nome.';
    if (!isDate(p.nascimento)) errors.nascimento = 'Informe a data de nascimento.';
    else if (p.nascimento > today || p.nascimento < '1900-01-01') errors.nascimento = 'Confira a data de nascimento.';
    if (!isDate(p.dataTriagem)) errors.dataTriagem = 'Informe a data da triagem.';
    else if (isDate(p.nascimento) && p.dataTriagem < p.nascimento) errors.dataTriagem = 'A data da triagem não pode ser anterior ao nascimento.';
    if (p.cns && digits(p.cns).length !== 15) errors.cns = 'O Cartão SUS tem 15 números.';
    if (p.telefone && (digits(p.telefone).length < 10 || digits(p.telefone).length > 13)) errors.telefone = 'Confira o telefone, com DDD.';
    return errors;
  }

  var api = { FACTORS: FACTORS, CATEGORY_LABEL: CATEGORY_LABEL, CUT_MODERATE: CUT_MODERATE, CUT_HIGH: CUT_HIGH, allItems: allItems, score: score, validatePatient: validatePatient };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.TriagemCore = api;
})();
