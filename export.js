/* Exportação do resultado da triagem: planilha .xlsx e PDF. Roda só no navegador do usuário. */
(function () {
  'use strict';

  var DISCLAIMER = 'Este resumo é uma triagem e não um diagnóstico. A avaliação cabe a um profissional do serviço, que pode chegar a outra conclusão.';
  var PROTOTYPE = 'Protótipo em teste: pesos e pontos de corte ainda não foram validados.';
  var SUPPORT = ['188: CVV, apoio emocional, 24 horas', '192: SAMU, emergência de saúde', '190: Polícia Militar, em caso de perigo causado por outra pessoa'];

  function formatDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function ageAt(birth, on) {
    var b = birth.split('-').map(Number);
    var d = on.split('-').map(Number);
    var age = d[0] - b[0];
    if (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2])) age -= 1;
    return age;
  }

  /* Reúne dados do paciente e resultado em uma estrutura única para os dois formatos. */
  function buildReport(patient, r, labels) {
    var age = ageAt(patient.nascimento, patient.dataTriagem);
    return {
      patientRows: [
        ['Nome', patient.nome],
        ['Data de nascimento', formatDate(patient.nascimento)],
        ['Idade na triagem', age + (age === 1 ? ' ano' : ' anos')],
        ['Data da triagem', formatDate(patient.dataTriagem)],
        ['Cartão SUS', patient.cns || ''],
        ['Telefone', patient.telefone || ''],
        ['Profissional responsável', patient.profissional || ''],
        ['Observações', patient.observacoes || '']
      ].filter(function (row) { return row[1] !== ''; }),
      date: patient.dataTriagem,
      total: r.total,
      category: labels[r.category],
      categoryBySum: labels[r.categoryBySum],
      raisedByRule: r.raisedByRule,
      reasons: r.reasons,
      showSupport: r.showSupport,
      top: r.top.map(function (f) {
        return { label: f.factor.label, points: f.points, max: f.maxPoints, item: f.top.item.text, value: f.top.value };
      }),
      referral: [r.referral].concat(r.addons),
      answers: r.factors.reduce(function (rows, f) {
        return rows.concat(f.items.map(function (row) {
          return { factor: f.factor.label, text: row.item.text, source: row.item.source, value: row.value, weight: row.item.weight, points: row.points };
        }));
      }, [])
    };
  }

  /* ---------- Planilha .xlsx (arquivo ZIP sem compressão com XML) ---------- */

  function escapeXml(text) {
    /* Remove caracteres de controle, que deixam o XML inválido */
    return String(text)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function columnName(i) { return String.fromCharCode(65 + i); }

  /* Estilos: 0 normal, 1 negrito, 2 título, 3 texto com quebra, 4 número com 1 casa */
  function sheetXml(rows, widths) {
    var cols = widths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('');
    var body = rows.map(function (row, r) {
      var cells = row.map(function (cell, c) {
        if (cell === null || cell === '') return '';
        var value = cell && typeof cell === 'object' ? cell.v : cell;
        var style = cell && typeof cell === 'object' ? cell.s : 0;
        var ref = columnName(c) + (r + 1);
        if (typeof value === 'number') return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
        /* Texto vai sempre como inlineStr, então nunca é interpretado como fórmula */
        return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>' + cols + '</cols><sheetData>' + body + '</sheetData></worksheet>';
  }

  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    var encoder = new TextEncoder();
    var locals = [];
    var centrals = [];
    var offset = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
    var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };

    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = encoder.encode(file.text);
      var crc = crc32(data);
      /* versão 2.0, nomes em UTF-8, sem compressão, data fixa em 01/01/2000 */
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x2821), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = [].concat(u32(0x04034b50), common);
      locals.push(new Uint8Array(local), name, data);
      centrals.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });

    var centralSize = centrals.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
    var parts = locals.concat(centrals, [end]);
    var out = new Uint8Array(parts.reduce(function (s, p) { return s + p.length; }, 0));
    var pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function buildXlsx(report) {
    var b = function (v) { return { v: v, s: 1 }; };
    var wrap = function (v) { return { v: v, s: 3 }; };
    var num = function (v) { return { v: v, s: 4 }; };
    var resumo = [[{ v: 'Triagem psicossocial', s: 2 }], [PROTOTYPE], [], [b('Dados do paciente')]];
    report.patientRows.forEach(function (row) { resumo.push([row[0], wrap(row[1])]); });
    resumo.push([], [b('Resultado')], ['Pontuação (0 a 100)', num(report.total)], ['Categoria de risco', b(report.category)]);
    if (report.raisedByRule) {
      resumo.push(['Categoria só pela soma', report.categoryBySum]);
      report.reasons.forEach(function (reason) { resumo.push(['Regra de atenção', wrap(reason)]); });
    }
    resumo.push([], [b('Fatores que mais contribuíram')]);
    if (report.top.length === 0) resumo.push(['Nenhum fator somou pontos.']);
    report.top.forEach(function (f) { resumo.push([f.label, wrap(fmt(f.points) + ' de ' + fmt(f.max) + ' pontos. Resposta de maior influência: ' + f.item + ' (resposta ' + f.value + ')')]); });
    resumo.push([], [b('Sugestão de encaminhamento')]);
    report.referral.forEach(function (line) { resumo.push(['', wrap(line)]); });
    if (report.showSupport) {
      resumo.push([], [b('Apoio disponível agora')]);
      SUPPORT.forEach(function (line) { resumo.push(['', line]); });
    }
    resumo.push([], ['', wrap(DISCLAIMER)]);

    var respostas = [[b('Fator'), b('Pergunta'), b('Origem'), b('Resposta (0 a 10)'), b('Peso'), b('Pontos')]];
    report.answers.forEach(function (a) { respostas.push([a.factor, wrap(a.text), a.source, a.value, a.weight, num(a.points)]); });
    respostas.push([b('Total'), '', '', '', 100, num(report.total)]);

    var ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zipStore([
      { name: '[Content_Types].xml', text: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: head + '<workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Respostas" sheetId="2" r:id="rId2"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: head + '<styleSheet ' + ns + '><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', text: sheetXml(resumo, [30, 90]) },
      { name: 'xl/worksheets/sheet2.xml', text: sheetXml(respostas, [24, 70, 32, 18, 8, 10]) }
    ]);
  }

  function fmt(n) { return n.toFixed(1).replace('.', ','); }

  /* ---------- PDF ---------- */

  /* As fontes padrão do PDF cobrem Latin-1; o restante é trocado por equivalente simples. */
  function pdfText(text) {
    return String(text)
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
      .replace(/[^\u0009\u000a -~ -ÿ]/g, '?');
  }

  function buildPdf(report, JsPDF) {
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 16;
    var y = M;

    function room(h) { if (y + h > H - 16) { doc.addPage(); y = M; } }
    function write(text, opt) {
      opt = opt || {};
      var size = opt.size || 10.5;
      var x = M + (opt.indent || 0);
      doc.setFont('helvetica', opt.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opt.muted ? 85 : 30);
      var lines = doc.splitTextToSize(pdfText(text), W - M - x);
      var lh = size * 0.46;
      lines.forEach(function (line) {
        room(lh);
        doc.text(line, x, y + lh * 0.8);
        y += lh;
      });
      y += opt.after === undefined ? 1.2 : opt.after;
    }
    function section(title) { y += 3.5; room(14); write(title, { bold: true, size: 12, after: 1.5 }); }

    write('Triagem psicossocial', { bold: true, size: 18, after: 1 });
    write(PROTOTYPE, { muted: true, size: 9, after: 2 });

    section('Dados do paciente');
    report.patientRows.forEach(function (row) { write(row[0] + ': ' + row[1]); });

    section('Resultado');
    write('Pontuação: ' + fmt(report.total) + ' de 100', { bold: true, size: 13 });
    write('Categoria de risco: ' + report.category, { bold: true, size: 13 });
    if (report.raisedByRule) {
      write('Só pela soma, o risco seria ' + report.categoryBySum.toLowerCase() + '. Ele subiu por uma regra de atenção. ' + report.reasons.join(' '));
    }

    section('Fatores que mais contribuíram');
    if (report.top.length === 0) write('Nenhum fator somou pontos.');
    report.top.forEach(function (f) {
      write(f.label + ': ' + fmt(f.points) + ' de ' + fmt(f.max) + ' pontos', { bold: true, after: .4 });
      write('Resposta de maior influência: ' + f.item + ' (resposta ' + f.value + ')', { muted: true });
    });

    section('Sugestão de encaminhamento');
    report.referral.forEach(function (line) { write(line); });

    if (report.showSupport) {
      section('Apoio disponível agora');
      SUPPORT.forEach(function (line) { write(line); });
    }

    y += 2;
    write(DISCLAIMER, { muted: true, size: 9.5 });

    /* Tabela de respostas */
    section('Respostas');
    var colPts = W - M;
    var colPeso = colPts - 16;
    var colResp = colPeso - 14;
    var textWidth = colResp - 18 - M;
    function tableHead() {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30);
      doc.text('Pergunta', M, y + 3.5);
      doc.text('Resposta', colResp, y + 3.5, { align: 'right' });
      doc.text('Peso', colPeso, y + 3.5, { align: 'right' });
      doc.text('Pontos', colPts, y + 3.5, { align: 'right' });
      y += 5;
      doc.setDrawColor(150);
      doc.line(M, y, W - M, y);
      y += 1.5;
    }
    room(12);
    tableHead();
    var lastFactor = null;
    report.answers.forEach(function (a) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      var lines = doc.splitTextToSize(pdfText(a.text), textWidth);
      var h = lines.length * 4.2 + 1.8 + (a.factor !== lastFactor ? 5.5 : 0);
      if (y + h > H - 16) { doc.addPage(); y = M; tableHead(); lastFactor = null; h = lines.length * 4.2 + 7.3; }
      if (a.factor !== lastFactor) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30);
        doc.text(pdfText(a.factor), M, y + 3.8);
        y += 5.5;
        lastFactor = a.factor;
        doc.setFont('helvetica', 'normal');
      }
      doc.setTextColor(30);
      doc.text(lines, M, y + 3.2);
      doc.text(String(a.value), colResp, y + 3.2, { align: 'right' });
      doc.text(String(a.weight), colPeso, y + 3.2, { align: 'right' });
      doc.text(fmt(a.points), colPts, y + 3.2, { align: 'right' });
      y += lines.length * 4.2 + 1.8;
    });

    /* Rodapé com número da página */
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(85);
      doc.text(pdfText('Triagem, não diagnóstico. Contém dados pessoais e de saúde.'), M, H - 9);
      doc.text('Página ' + i + ' de ' + pages, W - M, H - 9, { align: 'right' });
    }
    return doc;
  }

  var api = { buildReport: buildReport, buildXlsx: buildXlsx, buildPdf: buildPdf, ageAt: ageAt, formatDate: formatDate, crc32: crc32, DISCLAIMER: DISCLAIMER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.TriagemExport = api;
})();
