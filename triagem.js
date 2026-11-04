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

  if (typeof module === 'object' && module.exports) {
    module.exports = { FACTORS: FACTORS, allItems: allItems, score: score };
  }
  if (typeof document === 'undefined') return;

  /* ---------- Interface ---------- */

  var form = document.getElementById('triagem');
  var host = document.getElementById('questions');
  var errors = document.getElementById('errors');
  var result = document.getElementById('resultado');
  var progressText = document.getElementById('progress-text');
  var progressFill = document.getElementById('progress-fill');
  var total = allItems().length;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function fmt(n) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function renderQuestion(factor, item) {
    var low = item.low || factor.low;
    var high = item.high || factor.high;
    var hintId = 'hint-' + item.id;
    var scale = el('div', { class: 'scale' });

    for (var v = 0; v <= 10; v++) {
      scale.appendChild(el('label', {}, [
        el('input', { type: 'radio', name: item.id, value: String(v), required: 'required' }),
        el('span', { text: String(v) })
      ]));
    }

    return el('div', { class: 'q-card' }, [el('fieldset', { id: 'q-' + item.id, 'aria-describedby': hintId }, [
      el('legend', { text: item.text }),
      el('div', { class: 'anchors', id: hintId }, [
        el('span', { text: '0 = ' + low }),
        el('span', { text: '10 = ' + high })
      ]),
      scale,
      el('span', { class: 'bar', 'aria-hidden': 'true' }, [el('span', { class: 'bar-fill' })]),
      item.support ? el('p', { class: 'note', role: 'status', hidden: 'hidden' }) : null,
      el('p', { class: 'field-error', id: 'err-' + item.id, hidden: 'hidden', text: 'Escolha um valor de 0 a 10.' })
    ])]);
  }

  var chips = document.getElementById('chips');

  FACTORS.forEach(function (f, i) {
    host.appendChild(el('section', { class: 'factor', id: 'parte-' + f.id, 'aria-labelledby': 'h-' + f.id }, [
      el('div', { class: 'factor-head' }, [
        el('span', { class: 'factor-num', 'aria-hidden': 'true', text: String(i + 1) }),
        el('h2', { id: 'h-' + f.id, text: f.label }),
        el('p', { class: 'factor-window', text: f.window })
      ]),
      el('div', { class: 'cards' }, f.items.map(function (it) { return renderQuestion(f, it); }))
    ]));
    chips.appendChild(el('a', { class: 'chip', id: 'chip-' + f.id, href: '#parte-' + f.id, text: f.label }));
  });

  function updateChips(answers) {
    FACTORS.forEach(function (f) {
      var done = f.items.every(function (it) { return answers[it.id] !== undefined; });
      var chip = document.getElementById('chip-' + f.id);
      chip.classList.toggle('done', done);
      chip.textContent = (done ? '✓ ' : '') + f.label;
      chip.setAttribute('aria-label', f.label + (done ? ', parte respondida' : ''));
    });
  }

  function readAnswers() {
    var answers = {};
    allItems().forEach(function (it) {
      var checked = form.querySelector('input[name="' + it.id + '"]:checked');
      if (checked) answers[it.id] = Number(checked.value);
    });
    return answers;
  }

  function updateProgress() {
    var current = readAnswers();
    var done = Object.keys(current).length;
    updateChips(current);
    progressText.textContent = done + ' de ' + total;
    progressFill.style.width = (done / total) * 100 + '%';
  }

  form.addEventListener('change', function (e) {
    var input = e.target;
    var fs = input.closest('fieldset');
    fs.querySelector('.bar-fill').style.width = Number(input.value) * 10 + '%';
    fs.classList.remove('missing');
    fs.querySelector('.field-error').hidden = true;

    var note = fs.querySelector('.note');
    if (note) {
      var show = Number(input.value) > 0;
      note.hidden = !show;
      note.textContent = show ? 'Obrigado por responder. Se quiser conversar agora, o CVV atende 24 horas pelo 188.' : '';
    }
    updateProgress();

    /* A lista de erros acompanha as respostas, para não indicar o que já foi resolvido */
    if (!errors.hidden) {
      var answers = readAnswers();
      var left = allItems().filter(function (it) { return answers[it.id] === undefined; });
      if (left.length) renderErrorList(left);
      else errors.hidden = true;
    }
  });

  function renderErrorList(missing) {
    errors.textContent = '';
    errors.appendChild(el('p', { text: missing.length === 1 ? 'Falta responder 1 pergunta:' : 'Faltam responder ' + missing.length + ' perguntas:' }));
    errors.appendChild(el('ul', {}, missing.map(function (it) {
      return el('li', {}, [el('a', { href: '#q-' + it.id, text: it.text })]);
    })));
  }

  function showErrors(missing) {
    renderErrorList(missing);
    errors.hidden = false;
    missing.forEach(function (it) {
      var fs = document.getElementById('q-' + it.id);
      fs.classList.add('missing');
      fs.querySelector('.field-error').hidden = false;
    });
    errors.focus();
  }

  errors.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    var fs = document.querySelector(link.getAttribute('href'));
    fs.scrollIntoView({ block: 'start' });
    fs.querySelector('input').focus({ preventScroll: true });
  });

  function supportBlock() {
    return el('div', { class: 'help' }, [
      el('h3', { text: 'Apoio disponível agora' }),
      el('p', { text: 'Algumas respostas indicam que pode ser bom falar com alguém sem esperar pelo atendimento.' }),
      el('ul', {}, [
        ['tel:188', '188', 'CVV, apoio emocional, 24 horas'],
        ['tel:192', '192', 'SAMU, emergência de saúde'],
        ['tel:190', '190', 'Polícia Militar, em caso de perigo causado por outra pessoa']
      ].map(function (c) {
        return el('li', {}, [el('a', { href: c[0] }, [el('strong', { text: c[1] }), el('span', { text: c[2] })])]);
      }))
    ]);
  }

  function renderResult(r) {
    result.textContent = '';

    result.appendChild(el('h2', { id: 'result-title', text: 'Resumo da triagem' }));
    var left = el('div', { class: 'result-col' });
    var right = el('div', { class: 'result-col' });
    result.appendChild(el('div', { class: 'result-grid' }, [left, right]));

    left.appendChild(el('div', { class: 'score' }, [
      el('span', { class: 'score-value', text: fmt(r.total) }),
      el('span', { class: 'score-max', text: 'de 100 pontos' })
    ]));
    left.appendChild(el('p', {}, [
      el('span', { class: 'category cat-' + r.category, text: 'Categoria de risco: ' + CATEGORY_LABEL[r.category] })
    ]));

    if (r.raisedByRule) {
      left.appendChild(el('p', {
        class: 'reason',
        text: 'Só pela soma, o risco seria ' + CATEGORY_LABEL[r.categoryBySum].toLowerCase() + '. Ele subiu por uma regra de atenção. ' + r.reasons.join(' ')
      }));
    }

    if (r.showSupport) left.appendChild(supportBlock());

    right.appendChild(el('h3', { text: 'Fatores que mais contribuíram' }));
    if (r.top.length === 0) {
      right.appendChild(el('p', { text: 'Nenhum fator somou pontos.' }));
    } else {
      right.appendChild(el('ol', { class: 'contrib' }, r.top.map(function (f) {
        return el('li', {}, [
          el('div', { class: 'contrib-head' }, [
            el('span', { text: f.factor.label }),
            el('span', { text: fmt(f.points) + ' de ' + fmt(f.maxPoints) + ' pontos' })
          ]),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, [
            el('span', { class: 'bar-fill', style: 'width:' + f.pct + '%' })
          ]),
          el('p', { class: 'contrib-item', text: 'Resposta de maior influência: “' + f.top.item.text + '” (resposta ' + f.top.value + ')' })
        ]);
      })));
    }

    result.appendChild(el('div', { class: 'referral-block' }, [
      el('h3', { text: 'Sugestão de encaminhamento' }),
      el('div', { class: 'referral' }, [el('p', { text: r.referral })].concat(
        r.addons.map(function (a) { return el('p', { text: a }); })
      ))
    ]));

    result.appendChild(el('p', {
      class: 'disclaimer',
      text: 'Este resumo é uma triagem e não um diagnóstico. A avaliação cabe a um profissional do serviço, que pode chegar a outra conclusão.'
    }));

    var rows = [];
    r.factors.forEach(function (f) {
      f.items.forEach(function (row) {
        rows.push(el('tr', {}, [
          el('td', {}, [
            document.createTextNode(row.item.text),
            el('span', { class: 'source', text: f.factor.label + ' · ' + row.item.source })
          ]),
          el('td', { class: 'num', text: String(row.value) }),
          el('td', { class: 'num', text: String(row.item.weight) }),
          el('td', { class: 'num', text: fmt(row.points) })
        ]));
      });
    });

    result.appendChild(el('details', {}, [
      el('summary', { text: 'Como cada resposta entrou no cálculo' }),
      el('p', { text: 'Pontos de cada pergunta = (resposta ÷ 10) × peso. Os pesos somam 100. Pela soma: abaixo de ' + CUT_MODERATE + ' é baixo, de ' + CUT_MODERATE + ' até menos de ' + CUT_HIGH + ' é moderado, e a partir de ' + CUT_HIGH + ' é alto. Algumas respostas elevam a categoria mesmo com soma baixa.' }),
      el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Respostas, pesos e pontos' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', text: 'Pergunta' }),
            el('th', { scope: 'col', class: 'num', text: 'Resposta' }),
            el('th', { scope: 'col', class: 'num', text: 'Peso' }),
            el('th', { scope: 'col', class: 'num', text: 'Pontos' })
          ])]),
          el('tbody', {}, rows)
        ])
      ])
    ]));

    var again = el('button', { type: 'button', class: 'btn', id: 'reiniciar', text: 'Limpar respostas e iniciar nova triagem' });
    again.addEventListener('click', restart);
    result.appendChild(again);

    result.hidden = false;
    result.scrollIntoView({ block: 'start' });
    result.focus({ preventScroll: true });
  }

  function restart() {
    form.reset();
    form.querySelectorAll('.bar-fill').forEach(function (b) { b.style.width = '0'; });
    form.querySelectorAll('.note').forEach(function (n) { n.hidden = true; n.textContent = ''; });
    result.hidden = true;
    result.textContent = '';
    errors.hidden = true;
    updateProgress();
    window.scrollTo(0, 0);
    document.getElementById('h-' + FACTORS[0].id).setAttribute('tabindex', '-1');
    document.getElementById('h-' + FACTORS[0].id).focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var answers = readAnswers();
    var missing = allItems().filter(function (it) { return answers[it.id] === undefined; });
    if (missing.length) {
      result.hidden = true;
      showErrors(missing);
      return;
    }
    errors.hidden = true;
    renderResult(score(answers));
  });

  updateProgress();
})();
