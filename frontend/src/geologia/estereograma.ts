// Projeção estereográfica de igual área (rede de Schmidt), hemisfério inferior.
// Convenções: azimutes em graus a partir do norte, sentido horário; x para leste, y para o norte.

const RAD = Math.PI / 180;

export interface Ponto {
  x: number; // -1..1 (leste positivo)
  y: number; // -1..1 (norte positivo)
}

/** Linha (rumo do caimento, caimento) → ponto na rede de raio 1. Caimento 90° = centro; 0° = borda. */
export function projetarLinha(trend: number, plunge: number): Ponto {
  const r = Math.SQRT2 * Math.sin(((90 - plunge) * RAD) / 2);
  return { x: r * Math.sin(trend * RAD), y: r * Math.cos(trend * RAD) };
}

/** Polo de um plano (direção de mergulho, mergulho): rumo = dipdir + 180, caimento = 90 − mergulho. */
export function polo(dipDir: number, dip: number): Ponto {
  return projetarLinha((dipDir + 180) % 360, 90 - dip);
}

/** Grande círculo do plano: linhas contidas no plano, de uma direção (strike) à outra. */
export function grandeCirculo(dipDir: number, dip: number, passos = 90): Ponto[] {
  const pontos: Ponto[] = [];
  const strike = (dipDir - 90 + 360) % 360;
  for (let i = 0; i <= passos; i++) {
    const ang = (180 * i) / passos; // ângulo dentro do plano, a partir da direção
    // vetor no plano: combinação da direção (horizontal) e da linha de máximo mergulho
    const sv = [Math.sin(strike * RAD), Math.cos(strike * RAD), 0];
    const dv = [Math.sin(dipDir * RAD) * Math.cos(dip * RAD), Math.cos(dipDir * RAD) * Math.cos(dip * RAD), -Math.sin(dip * RAD)];
    const v = [0, 1, 2].map((k) => Math.cos(ang * RAD) * sv[k] + Math.sin(ang * RAD) * dv[k]);
    const plunge = -Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD;
    const trend = (Math.atan2(v[0], v[1]) / RAD + 360) % 360;
    pontos.push(projetarLinha(trend, Math.max(0, plunge)));
  }
  return pontos;
}
