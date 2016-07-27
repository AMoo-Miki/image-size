'use strict';

//inspired by https://github.com/ankakaak/node-imageinfo

var readUInt = require('../readUInt'),
    zlib = require('zlib'),
    lzma = require("lzma");

function readBit(buffer, offset, bitOffset) {
  if (bitOffset > 7) {
    offset += Math.floor(bitOffset / 8);
    bitOffset = bitOffset % 8;
  }

  var b = buffer[offset];
  if (bitOffset < 7) {
    b >>>= (7 - bitOffset);
  }

  var val = b & 0x01;
  return val;
}

function readBits(buffer, offset, bitOffset, bitLen, signed) {
  var val = 0;

  var neg = false;
  if (signed) {
    neg = readBit(buffer, offset, bitOffset) > 0;
    bitLen--;
    bitOffset++;
  }

  var bytes = [];
  for (var i = 0; i < bitLen; i++) {
    var b = readBit(buffer, offset, bitOffset + i);
    if (i > 0 && (bitLen - i) % 8 == 0) {
      bytes.push(val);
      val = 0;
    }
    val <<= 1;
    val |= b;
  }
  bytes.push(val);

  val = new Buffer(bytes);
  val.negative = neg?true:false;
  return val;
}

function bitsValue(buffer, pos, bitPos, numBits) {
  var val = readBits(buffer, pos, bitPos, numBits, true),
      bitValue = numBits > 9 ? readUInt(val, 16, 0, true) : val[0];
  return bitValue * (val.negative ? -1 : 1);
}

function decompressLZMA(buffer) {
  var scriptlen = (buffer[4] & 0xFF | (buffer[5] & 0xFF) << 8 | (buffer[6] & 0xFF) << 16 | buffer[7] << 24) - 8,
    headerUnCompressedSize = new Buffer([scriptlen & 0xFF, (scriptlen >> 8) & 0xFF, (scriptlen >> 16) & 0xFF, (scriptlen >> 24) & 0xFF, 0, 0, 0, 0]),
    newHeader = Buffer.concat([buffer.slice(12, 17), headerUnCompressedSize]);
  return lzma.decompress(Buffer.concat([newHeader, buffer.slice(17)]));
}

function isSWF (buffer) {
  var sig = buffer.toString('ASCII', 0, 3);
  return ~['FWS', 'CWS', 'ZWS'].indexOf(sig);
}

function calculate (buffer) {
  var sig = buffer.toString('ASCII', 0, 1),
    pos = 8,
    bitPos = 0,
    val;

  if (sig == 'C') {
    buffer = zlib.inflateSync(buffer.slice(8), {finishFlush: zlib.Z_SYNC_FLUSH});
    pos = 0;
  } else if (sig == 'Z') {
    buffer = decompressLZMA(buffer);
    pos = 0;
  }

  var numBits = readBits(buffer, pos, bitPos, 5)[0];
  bitPos += 5;

  var xMin = bitsValue(buffer, pos, bitPos, numBits);
  bitPos += numBits;

  var xMax = bitsValue(buffer, pos, bitPos, numBits);
  bitPos += numBits;

  var yMin = bitsValue(buffer, pos, bitPos, numBits);
  bitPos += numBits;

  var yMax = bitsValue(buffer, pos, bitPos, numBits);

  return {
    'width': Math.ceil((xMax - xMin) / 20),
    'height': Math.ceil((yMax - yMin) / 20)
  };
}

module.exports = {
  'detect': isSWF,
  'calculate': calculate
};
