module.exports = function (api) {
  void api.cache(() => process.env.NODE_ENV === "production");

  return {
    presets: [
      [require.resolve("@babel/preset-env"), { targets: { node: "current" } }],
      [require.resolve("@babel/preset-typescript"), { allowNamespaces: true, allowDeclareFields: true }],
    ],
  };
};
