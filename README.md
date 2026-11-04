# Triagem psicossocial (protótipo)

Questionário de 17 perguntas com botões de 0 a 10. O cálculo roda só no navegador: nada é enviado nem salvo.
**É uma triagem, não um diagnóstico, e não deve orientar decisões reais antes de validação clínica.**

- Abrir: `index.html`, sem instalação.
- Testar a pontuação: `node --test tests/`
- Ajustar perguntas, pesos e regras: início de `triagem.js`.

## Como a pontuação funciona

Pontos de cada pergunta = (resposta ÷ 10) × peso. Os pesos somam 100.

| Fator | Peso | Perguntas (peso) | Origem |
|---|---:|---|---|
| Risco imediato | 30 | R1 (14), R2 (6), R3 (10) | PHQ-9 item 9, DASS-21 item 21, R3 elaborada |
| Depressão | 22 | D1 (6), D2 (7), D3 (5), D4 (4) | PHQ-9 itens 1, 2, 6, 4 |
| Ansiedade | 18 | A1 (7), A2 (6), A3 (5) | DASS-21 itens 15, 20, 4 |
| Vulnerabilidade social | 16 | V1 (6), V2 (5), V3 (5) | elaboradas (sem fonte nos PDFs) |
| Sono | 7 | S1 (4), S2 (3) | Miniquestionário de Sono itens 2, 5 |
| Jogos de aposta | 7 | J1 (3), J2 (4) | PGSI itens 1, 7 |

Pela soma: baixo abaixo de 25, moderado de 25 até menos de 50, alto a partir de 50.

Regras que elevam a categoria, mesmo com soma baixa:

- **Alto:** R1 ≥ 3 ou R3 ≥ 5.
- **Ao menos moderado:** R1 ≥ 1, R3 ≥ 1, R2 ≥ 5, ou depressão, ansiedade ou vulnerabilidade em 70% ou mais do máximo do fator.

## O que precisa de revisão clínica

- Pesos, cortes e regras são propostas do protótipo, sem calibração em dados reais.
- Os itens foram recortados e passados para 0 a 10, então os pontos de corte originais das escalas não se aplicam.
- V1, V2, V3 e R3 foram elaboradas para o protótipo e não vêm de instrumento validado.
- Um uso real exige fluxo de atendimento para respostas de risco, adequação à LGPD e verificação das licenças das escalas.
