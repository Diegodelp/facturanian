const iconvLiteStub = {
  encode() {
    throw new Error('iconv-lite is not available. Encoding conversion requires installing iconv-lite.');
  },
  decode() {
    throw new Error('iconv-lite is not available. Decoding conversion requires installing iconv-lite.');
  },
  encodingExists() {
    return false;
  }
};

module.exports = iconvLiteStub;
module.exports.default = iconvLiteStub;
