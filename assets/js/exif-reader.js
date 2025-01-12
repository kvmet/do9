const ExifFormat = {
  // Common EXIF data formats
  BYTE: 1,
  ASCII: 2,
  SHORT: 3,
  LONG: 4,
  RATIONAL: 5,
  UNDEFINED: 7,
  SLONG: 9,
  SRATIONAL: 10,
};

const ExifTags = {
  // IFD0 (Main image tags)
  ImageTags: {
    Make: { id: 0x010f, name: "Make", format: ExifFormat.ASCII },
    Model: { id: 0x0110, name: "Model", format: ExifFormat.ASCII },
    Description: { id: 0x010e, name: "Description", format: ExifFormat.ASCII },
    ExifIFDPointer: {
      id: 0x8769,
      name: "ExifIFDPointer",
      format: ExifFormat.LONG,
    },
  },

  // EXIF SubIFD tags
  ExifTags: {
    ExposureTime: {
      id: 0x829a,
      name: "ExposureTime",
      format: ExifFormat.RATIONAL,
    },
    FNumber: { id: 0x829d, name: "FNumber", format: ExifFormat.RATIONAL },
    ISO: { id: 0x8827, name: "ISO", format: ExifFormat.SHORT },
    DateTimeOriginal: {
      id: 0x9003,
      name: "DateTimeOriginal",
      format: ExifFormat.ASCII,
    },
    FocalLength: {
      id: 0x920a,
      name: "FocalLength",
      format: ExifFormat.RATIONAL,
    },
    LensModel: { id: 0xa434, name: "LensModel", format: ExifFormat.ASCII },
    Flash: { id: 0x9209, name: "Flash", format: ExifFormat.SHORT },
    ExposureMode: {
      id: 0xa402,
      name: "ExposureMode",
      format: ExifFormat.SHORT,
    },
  },
};

const ValueMaps = {
  Flash: {
    0x0: "No Flash",
    0x1: "Flash Fired",
    0x5: "Flash Fired, Return not detected",
    0x7: "Flash Fired, Return detected",
    0x8: "On, Flash did not fire",
    0x9: "Flash Fired, Compulsory",
    0xd: "Flash Fired, Compulsory, Return not detected",
    0xf: "Flash Fired, Compulsory, Return detected",
    0x10: "Off, Did not fire",
    0x18: "Off, Did not fire, Return not detected",
    0x19: "Flash Fired, Auto",
    0x1d: "Flash Fired, Auto, Return not detected",
    0x1f: "Flash Fired, Auto, Return detected",
    0x20: "No flash function",
    0x41: "Flash Fired, Red-eye reduction",
    0x45: "Flash Fired, Red-eye reduction, Return not detected",
    0x47: "Flash Fired, Red-eye reduction, Return detected",
    0x49: "Flash Fired, Compulsory, Red-eye reduction",
    0x4d: "Flash Fired, Compulsory, Red-eye reduction, Return not detected",
    0x4f: "Flash Fired, Compulsory, Red-eye reduction, Return detected",
    0x59: "Flash Fired, Auto, Red-eye reduction",
    0x5d: "Flash Fired, Auto, Return not detected, Red-eye reduction",
    0x5f: "Flash Fired, Auto, Return detected, Red-eye reduction",
  },

  ExposureMode: {
    0: "Auto",
    1: "Manual",
    2: "Auto bracket",
  },
};

class ExifParser {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.littleEndian = false;
    this.tiffOffset = 0;
  }

  static async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new ExifParser(e.target.result).parse());
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  parse() {
    if (!this.isValidJpeg()) {
      throw new Error("Not a valid JPEG");
    }

    const exifOffset = this.findExifOffset();
    return this.parseExifData(exifOffset);
  }

  isValidJpeg() {
    return this.view.getUint16(0, false) === 0xffd8;
  }

  findExifOffset() {
    let offset = 2;
    console.log("Starting EXIF search at offset:", offset);

    while (offset < this.view.byteLength) {
      const marker = this.view.getUint16(offset, false);
      console.log("Marker found:", marker.toString(16), "at offset:", offset);

      if (marker === 0xffe1) {
        const returnOffset = offset + 4;
        console.log("Found EXIF marker. Returning offset:", returnOffset);
        return returnOffset;
      }
      offset += 2 + this.view.getUint16(offset + 2, false);
    }
    throw new Error("No EXIF data found");
  }

  parseExifData(start) {
    console.log("Starting EXIF parsing at offset:", start);

    // Debug: Log the first few bytes
    const firstBytes = [];
    for (let i = 0; i < 10; i++) {
      firstBytes.push(this.view.getUint8(start + i).toString(16));
    }
    console.log("First 10 bytes at start:", firstBytes.join(" "));

    const exifResult = {
      image: {},
      exif: {},
      raw: {},
    };

    // Read and log each character of the EXIF header
    const headerChars = [];
    for (let i = 0; i < 4; i++) {
      const char = this.view.getUint8(start + i);
      headerChars.push({
        char: char,
        asAscii: String.fromCharCode(char),
      });
    }
    console.log("EXIF header chars:", headerChars);

    const exifHeader = this.getAsciiValue(start, 4);
    console.log("Parsed EXIF header:", exifHeader);

    if (exifHeader !== "Exif") {
      throw new Error(`Invalid EXIF data (header: "${exifHeader}")`);
    }

    // Skip the null bytes
    this.tiffOffset = start + 6;
    console.log("TIFF offset:", this.tiffOffset);

    const byteAlign = this.view.getUint16(this.tiffOffset);
    console.log("Byte align:", byteAlign.toString(16));

    this.littleEndian = byteAlign === 0x4949;
    console.log("Little endian:", this.littleEndian);

    const magic = this.view.getUint16(this.tiffOffset + 2, !this.littleEndian);
    console.log("Magic number:", magic.toString(16));

    if (magic !== 0x002a) {
      throw new Error(`Invalid TIFF data (magic: ${magic.toString(16)})`);
    }

    // Get offset to first IFD
    const ifd0Offset = this.view.getUint32(
      this.tiffOffset + 4,
      !this.littleEndian,
    );

    // Parse IFD0
    this.parseIfd(
      this.tiffOffset + ifd0Offset,
      ExifTags.ImageTags,
      exifResult.image,
    );

    // Parse EXIF SubIFD if it exists
    if (exifResult.image.ExifIFDPointer) {
      this.parseIfd(
        this.tiffOffset + exifResult.image.ExifIFDPointer,
        ExifTags.ExifTags,
        exifResult.exif,
      );
    }

    return this.formatExifData(exifResult);
  }

  getAsciiValue(offset, length) {
    const array = [];
    for (let i = 0; i < length; i++) {
      const char = this.view.getUint8(offset + i);
      if (char === 0) break;
      array.push(String.fromCharCode(char));
    }
    return array.join("");
  }

  parseIfd(offset, tagDefinitions, result) {
    const numEntries = this.view.getUint16(offset, !this.littleEndian);
    let entryOffset = offset + 2;

    for (let i = 0; i < numEntries; i++) {
      const tag = this.view.getUint16(entryOffset, !this.littleEndian);
      const format = this.view.getUint16(entryOffset + 2, !this.littleEndian);
      const components = this.view.getUint32(
        entryOffset + 4,
        !this.littleEndian,
      );
      const valueOffset = this.view.getUint32(
        entryOffset + 8,
        !this.littleEndian,
      );

      const tagInfo = Object.values(tagDefinitions).find((t) => t.id === tag);

      if (tagInfo) {
        result[tagInfo.name] = this.readTagValue(
          format,
          components,
          valueOffset,
          entryOffset + 8,
        );
      }

      entryOffset += 12;
    }
  }

  formatExifData(rawData) {
    return {
      camera: {
        make: rawData.image.Make,
        model: rawData.image.Model,
        description: rawData.image.Description,
      },
      technical: {
        shutterSpeed: this.formatRational(rawData.exif.ExposureTime),
        aperture: this.formatRational(rawData.exif.FNumber),
        iso: rawData.exif.ISO,
        focalLength: this.formatRational(rawData.exif.FocalLength),
        flash: ValueMaps.Flash[rawData.exif.Flash],
        exposureMode: ValueMaps.ExposureMode[rawData.exif.ExposureMode],
      },
      meta: {
        dateTime: rawData.exif.DateTimeOriginal,
        lensModel: rawData.exif.LensModel,
      },
      raw: rawData, // Keep raw data for debugging
    };
  }

  readTagValue(format, components, valueOffset, offsetLocation) {
    const value = this.getRawValue(
      format,
      components,
      valueOffset,
      offsetLocation,
    );

    // For values that fit in 4 bytes, the value offset actually contains the value
    const actualOffset =
      components <= 4 &&
      format !== ExifFormat.RATIONAL &&
      format !== ExifFormat.SRATIONAL
        ? offsetLocation
        : this.tiffOffset + valueOffset;

    switch (format) {
      case ExifFormat.BYTE:
        return this.view.getUint8(actualOffset);

      case ExifFormat.ASCII:
        return this.getAsciiValue(actualOffset, components);

      case ExifFormat.SHORT:
        if (components === 1) {
          return this.view.getUint16(actualOffset, !this.littleEndian);
        } else {
          return this.getShortValues(actualOffset, components);
        }

      case ExifFormat.LONG:
        if (components === 1) {
          return this.view.getUint32(actualOffset, !this.littleEndian);
        } else {
          return this.getLongValues(actualOffset, components);
        }

      case ExifFormat.RATIONAL:
        if (components === 1) {
          return this.getRationalValue(actualOffset);
        } else {
          return this.getRationalValues(actualOffset, components);
        }

      case ExifFormat.UNDEFINED:
        return this.getUndefinedValue(actualOffset, components);

      case ExifFormat.SLONG:
        if (components === 1) {
          return this.view.getInt32(actualOffset, !this.littleEndian);
        } else {
          return this.getSLongValues(actualOffset, components);
        }

      case ExifFormat.SRATIONAL:
        if (components === 1) {
          return this.getSRationalValue(actualOffset);
        } else {
          return this.getSRationalValues(actualOffset, components);
        }

      default:
        console.warn(`Unhandled EXIF format: ${format}`);
        return null;
    }
  }

  // Helper methods for different value types
  getAsciiValue(offset, length) {
    const array = [];
    for (let i = 0; i < length; i++) {
      const char = this.view.getUint8(offset + i);
      if (char === 0) break; // Stop at null terminator
      array.push(String.fromCharCode(char));
    }
    return array.join("");
  }

  getShortValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getUint16(offset + i * 2, !this.littleEndian));
    }
    return values;
  }

  getLongValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getUint32(offset + i * 4, !this.littleEndian));
    }
    return values;
  }

  getSLongValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getInt32(offset + i * 4, !this.littleEndian));
    }
    return values;
  }

  getRationalValue(offset) {
    const numerator = this.view.getUint32(offset, !this.littleEndian);
    const denominator = this.view.getUint32(offset + 4, !this.littleEndian);
    return { numerator, denominator };
  }

  getRationalValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.getRationalValue(offset + i * 8));
    }
    return values;
  }

  getSRationalValue(offset) {
    const numerator = this.view.getInt32(offset, !this.littleEndian);
    const denominator = this.view.getInt32(offset + 4, !this.littleEndian);
    return { numerator, denominator };
  }

  getSRationalValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.getSRationalValue(offset + i * 8));
    }
    return values;
  }

  getUndefinedValue(offset, length) {
    const values = [];
    for (let i = 0; i < length; i++) {
      values.push(this.view.getUint8(offset + i));
    }
    return values;
  }

  // Utility method for formatting rational numbers
  formatRational(rational) {
    if (!rational) return null;
    if (Array.isArray(rational)) {
      return rational.map((r) => this.formatRational(r));
    }
    const { numerator, denominator } = rational;
    if (denominator === 0) return null;

    // Format special cases like exposure time
    if (numerator === 1) {
      return `1/${denominator}`;
    }

    return (numerator / denominator).toFixed(2);
  }
}

export { ExifParser };
