export function schemaSql(sql, names) {
  const mapping = { market_data: names.marketData, srb_core: names.core,
    srb_derived: names.derived, srb_lab: names.lab };
  // Preserve string literals; only replace SQL identifiers.
  return sql.replace(/'(?:\\.|''|[^'])*'|"(?:\\.|""|[^"])*"|`?[A-Za-z_][A-Za-z0-9_]*`?/g, token => {
    if (token.startsWith("'") || token.startsWith('"')) return token;
    const name = token.replaceAll('`', '');
    if (!Object.hasOwn(mapping, name)) return token;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(mapping[name])) throw new Error('Invalid schema name');
    return '`' + mapping[name] + '`';
  });
}
