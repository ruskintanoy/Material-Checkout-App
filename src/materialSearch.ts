import type { Material } from './domain';

function tokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

function damerauLevenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) distances[row][0] = row;
  for (let column = 0; column < columns; column += 1) distances[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost,
      );

      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        distances[row][column] = Math.min(
          distances[row][column],
          distances[row - 2][column - 2] + 1,
        );
      }
    }
  }

  return distances[left.length][right.length];
}

function tokenMatches(queryToken: string, materialToken: string): boolean {
  if (materialToken.includes(queryToken)) return true;
  if (queryToken.length < 4) return false;

  const allowedEdits = queryToken.length >= 8 ? 2 : 1;
  if (Math.abs(queryToken.length - materialToken.length) > allowedEdits) return false;

  return damerauLevenshtein(queryToken, materialToken) <= allowedEdits;
}

export function matchesMaterialSearch(material: Material, query: string): boolean {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return true;

  const materialTokens = tokens(`${material.name} ${material.productCode} ${material.unit}`);
  return queryTokens.every((queryToken) =>
    materialTokens.some((materialToken) => tokenMatches(queryToken, materialToken)),
  );
}
