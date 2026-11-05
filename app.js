/* Interface: abas, formulários e resumo. Nenhum dado sai do navegador nem é salvo nele. */
(function () {
  'use strict';

  var core = window.TriagemCore;
  var FACTORS = core.FACTORS;
  var CATEGORY_LABEL = core.CATEGORY_LABEL;
  var allItems = core.allItems;
  var exporter = window.TriagemExport;

  var formDados = document.getElementById('form-dados');
  var form = document.getElementById('triagem');
  var host = document.getElementById('questions');
  var errors = document.getElementById('errors');
  var result = document.getElementById('resultado');
  var progress = document.getElementById('progress');
  var progressText = document.getElementById('progress-text');
  var progressFill = document.getElementById('progress-fill');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var tabResumo = document.querySelector('.tab[data-tab="resumo"]');
  var total = allItems().length;
  var LABELS = { nome: 'Nome', nascimento: 'Data de nascimento', dataTriagem: 'Data da triagem', cns: 'Cartão SUS', telefone: 'Telefone' };

  var state = { tab: 'dados', submitted: false };

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

  function todayIso() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- Abas ---------- */

  function showTab(name, moveFocus) {
    state.tab = name;
    ['dados', 'perguntas', 'resumo'].forEach(function (id) {
      document.getElementById('tab-' + id).hidden = id !== name;
    });
    tabs.forEach(function (t) {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'step');
      else t.removeAttribute('aria-current');
    });
    progress.hidden = name !== 'perguntas';
    window.scrollTo(0, 0);
    if (moveFocus !== false) document.getElementById('title-' + name).focus({ preventScroll: true });
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var target = t.dataset.tab;
      if (target === state.tab) return;
      /* Sair da aba de dados exige dados válidos: o resumo e os arquivos dependem deles */
      if (state.tab === 'dados' && !validateDados()) return;
      if (target === 'resumo') renderResult();
      showTab(target);
    });
  });

  /* ---------- Dados do paciente ---------- */

  function readPatient() {
    var data = {};
    new FormData(formDados).forEach(function (value, key) { data[key] = String(value).trim(); });
    return data;
  }

  function validateDados() {
    var found = core.validatePatient(readPatient(), todayIso());
    Object.keys(LABELS).forEach(function (key) {
      var input = document.getElementById(key);
      var err = document.getElementById('err-' + key);
      var message = found[key];
      err.hidden = !message;
      err.textContent = message || '';
      input.classList.toggle('invalid', Boolean(message));
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    var firstInvalid = Object.keys(LABELS).filter(function (k) { return found[k]; })[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid).focus();
      return false;
    }
    return true;
  }

  formDados.addEventListener('submit', function (e) {
    e.preventDefault();
    if (validateDados()) showTab('perguntas');
  });

  /* ---------- Perguntas ---------- */

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
      el('p', { class: 'field-error', hidden: 'hidden', text: 'Escolha um valor de 0 a 10.' })
    ])]);
  }

  FACTORS.forEach(function (f) {
    host.appendChild(el('section', { class: 'factor', 'aria-labelledby': 'h-' + f.id }, [
      el('h2', { id: 'h-' + f.id, text: f.label }),
      el('p', { class: 'factor-window', text: f.window }),
      el('div', { class: 'cards' }, f.items.map(function (it) { return renderQuestion(f, it); }))
    ]));
  });

  function readAnswers() {
    var answers = {};
    allItems().forEach(function (it) {
      var checked = form.querySelector('input[name="' + it.id + '"]:checked');
      if (checked) answers[it.id] = Number(checked.value);
    });
    return answers;
  }

  function missingItems(answers) {
    return allItems().filter(function (it) { return answers[it.id] === undefined; });
  }

  function updateProgress() {
    var done = Object.keys(readAnswers()).length;
    progressText.textContent = done + ' de ' + total;
    progressFill.style.width = (done / total) * 100 + '%';
  }

  function invalidateResult() {
    state.submitted = false;
    tabResumo.disabled = true;
    result.textContent = '';
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

    /* Resposta alterada: o resumo antigo deixa de valer até enviar de novo */
    if (state.submitted) invalidateResult();

    if (!errors.hidden) {
      var left = missingItems(readAnswers());
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

  errors.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    var fs = document.querySelector(link.getAttribute('href'));
    fs.scrollIntoView({ block: 'start' });
    fs.querySelector('input').focus({ preventScroll: true });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var answers = readAnswers();
    var missing = missingItems(answers);
    if (missing.length) {
      renderErrorList(missing);
      errors.hidden = false;
      missing.forEach(function (it) {
        var fs = document.getElementById('q-' + it.id);
        fs.classList.add('missing');
        fs.querySelector('.field-error').hidden = false;
      });
      errors.focus();
      return;
    }
    errors.hidden = true;
    state.submitted = true;
    tabResumo.disabled = false;
    renderResult();
    showTab('resumo');
  });

  /* ---------- Resumo ---------- */

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

  function currentReport(r) {
    return exporter.buildReport(readPatient(), r, CATEGORY_LABEL);
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function renderResult() {
    if (!state.submitted) return;
    var r = core.score(readAnswers());
    var report = currentReport(r);
    result.textContent = '';

    result.appendChild(el('dl', { class: 'patient' }, report.patientRows.map(function (row) {
      return el('div', {}, [el('dt', { text: row[0] + ':' }), el('dd', { text: row[1] })]);
    })));

    var card = el('div', { class: 'result' });
    result.appendChild(card);

    var left = el('div', { class: 'result-col' });
    var right = el('div', { class: 'result-col' });
    card.appendChild(el('div', { class: 'result-grid' }, [left, right]));

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

    right.appendChild(el('h2', { text: 'Fatores que mais contribuíram', style: 'margin-bottom:.625rem' }));
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

    card.appendChild(el('div', { class: 'referral-block' }, [
      el('h2', { text: 'Sugestão de encaminhamento', style: 'margin-bottom:.625rem' }),
      el('div', { class: 'referral' }, [el('p', { text: r.referral })].concat(
        r.addons.map(function (a) { return el('p', { text: a }); })
      ))
    ]));

    card.appendChild(el('p', { class: 'disclaimer', text: exporter.DISCLAIMER }));

    var exportError = el('p', { class: 'alert export-error', role: 'alert', hidden: 'hidden' });
    function exporting(fn) {
      return function () {
        exportError.hidden = true;
        try {
          fn();
        } catch (err) {
          exportError.textContent = 'Não foi possível gerar o arquivo. Tente de novo.';
          exportError.hidden = false;
        }
      };
    }
    var button = function (id, cls, text, onClick) {
      var b = el('button', { type: 'button', id: id, class: 'btn ' + cls, text: text });
      b.addEventListener('click', onClick);
      return b;
    };
    card.appendChild(el('div', { class: 'actions' }, [
      button('baixar-planilha', 'btn-primary', 'Baixar planilha', exporting(function () {
        var report = currentReport(core.score(readAnswers()));
        download(new Blob([exporter.buildXlsx(report)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exporter.fileName(report.fileBase.nome, report.fileBase.date, 'xlsx'));
      })),
      button('baixar-pdf', 'btn-primary', 'Baixar PDF', exporting(function () {
        var report = currentReport(core.score(readAnswers()));
        download(exporter.buildPdf(report, window.jspdf.jsPDF).output('blob'), exporter.fileName(report.fileBase.nome, report.fileBase.date, 'pdf'));
      })),
      button('editar-dados', '', 'Editar dados do paciente', function () { showTab('dados'); }),
      button('reiniciar', '', 'Nova triagem', restart)
    ]));
    card.appendChild(exportError);

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
    card.appendChild(el('details', {}, [
      el('summary', { text: 'Como cada resposta entrou no cálculo' }),
      el('p', { text: 'Pontos de cada pergunta = (resposta ÷ 10) × peso. Os pesos somam 100. Pela soma: abaixo de ' + core.CUT_MODERATE + ' é baixo, de ' + core.CUT_MODERATE + ' até menos de ' + core.CUT_HIGH + ' é moderado, e a partir de ' + core.CUT_HIGH + ' é alto. Algumas respostas elevam a categoria mesmo com soma baixa.' }),
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
  }

  function restart() {
    if (!window.confirm('Apagar os dados e as respostas desta triagem? Arquivos já baixados não são afetados.')) return;
    formDados.reset();
    form.reset();
    document.getElementById('dataTriagem').value = todayIso();
    form.querySelectorAll('.bar-fill').forEach(function (b) { b.style.width = '0'; });
    form.querySelectorAll('.note').forEach(function (n) { n.hidden = true; n.textContent = ''; });
    errors.hidden = true;
    invalidateResult();
    updateProgress();
    showTab('dados');
  }

  document.getElementById('dataTriagem').value = todayIso();
  updateProgress();
  showTab('dados', false);
})();
