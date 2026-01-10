"""
BrickLink Color Mapping
Maps BrickLink Color IDs to color names and RGB hex values.
"""

from typing import Optional, Dict, Tuple


class BricklinkColorMap:
    """Mapping of BrickLink Color IDs to names and RGB values."""
    
    # BrickLink ColorId -> Color Name
    ID_TO_NAME = {
        # Special/system
        0: "(Not Applicable)",
        
        # Solid colors
        1: "White",
        2: "Tan",
        3: "Yellow",
        4: "Orange",
        5: "Red",
        6: "Green",
        7: "Blue",
        8: "Brown",
        9: "Light Gray",
        10: "Dark Gray",
        11: "Black",
        23: "Pink",
        24: "Purple",
        25: "Salmon",
        26: "Light Salmon",
        27: "Rust",
        28: "Nougat",
        29: "Earth Orange",
        31: "Medium Orange",
        32: "Light Orange",
        33: "Light Yellow",
        34: "Lime",
        35: "Light Lime",
        36: "Bright Green",
        37: "Medium Green",
        38: "Light Green",
        39: "Dark Turquoise",
        40: "Light Turquoise",
        41: "Aqua",
        42: "Medium Blue",
        43: "Violet",
        44: "Light Violet",
        46: "Glow In Dark Opaque",
        47: "Dark Pink",
        48: "Sand Green",
        49: "Very Light Gray",
        54: "Sand Purple",
        55: "Sand Blue",
        56: "Rose Pink",
        57: "Chrome Antique Brass",
        58: "Sand Red",
        59: "Dark Red",
        60: "Milky White",
        61: "Pearl Light Gold",
        62: "Light Blue",
        63: "Dark Blue",
        68: "Dark Orange",
        69: "Dark Tan",
        71: "Magenta",
        72: "Maersk Blue",
        73: "Medium Violet",
        76: "Medium Lime",
        80: "Dark Green",
        85: "Dark Bluish Gray",
        86: "Light Bluish Gray",
        87: "Sky Blue",
        88: "Reddish Brown",
        89: "Dark Purple",
        90: "Light Nougat",
        91: "Light Brown",
        93: "Light Purple",
        94: "Medium Dark Pink",
        96: "Very Light Orange",
        97: "Blue-Violet",
        99: "Very Light Bluish Gray",
        103: "Bright Light Yellow",
        104: "Bright Pink",
        105: "Bright Light Blue",
        106: "Fabuland Brown",
        109: "Dark Blue-Violet",
        110: "Bright Light Orange",
        120: "Dark Brown",
        150: "Medium Nougat",
        152: "Light Aqua",
        153: "Dark Azure",
        154: "Lavender",
        155: "Olive Green",
        156: "Medium Azure",
        157: "Medium Lavender",
        158: "Yellowish Green",
        159: "Glow In Dark White",
        160: "Fabuland Orange",
        161: "Dark Yellow",
        165: "Neon Orange",
        166: "Neon Green",
        167: "Reddish Orange",
        168: "Umber",
        169: "Sienna",
        171: "Lemon",
        172: "Warm Yellowish Orange",
        220: "Coral",
        225: "Dark Nougat",
        226: "Trans-Light Bright Green",
        227: "Clikits Lavender",
        231: "Dark Salmon",
        236: "Neon Yellow",
        240: "Medium Brown",
        241: "Medium Tan",
        242: "Dark Olive Green",
        245: "Lilac",
        246: "Light Lilac",
        247: "Little Robots Blue",
        248: "Fabuland Lime",
        
        # Transparent
        12: "Trans-Clear",
        13: "Trans-Brown",
        14: "Trans-Dark Blue",
        15: "Trans-Light Blue",
        16: "Trans-Neon Green",
        17: "Trans-Red",
        18: "Trans-Neon Orange",
        19: "Trans-Yellow",
        20: "Trans-Green",
        50: "Trans-Dark Pink",
        51: "Trans-Purple",
        98: "Trans-Orange",
        107: "Trans-Pink",
        108: "Trans-Bright Green",
        113: "Trans-Aqua",
        114: "Trans-Light Purple",
        121: "Trans-Neon Yellow",
        164: "Trans-Light Orange",
        221: "Trans-Light Green",
        234: "Trans-Medium Purple",
        251: "Trans-Black",
        
        # Chrome
        21: "Chrome Gold",
        22: "Chrome Silver",
        52: "Chrome Blue",
        64: "Chrome Green",
        82: "Chrome Pink",
        122: "Chrome Black",
        
        # Pearl
        61: "Pearl Light Gold",
        66: "Pearl Light Gray",
        77: "Pearl Dark Gray",
        78: "Pearl Sand Blue",
        81: "Flat Dark Gold",
        83: "Pearl White",
        84: "Copper",
        95: "Flat Silver",
        115: "Pearl Gold",
        119: "Pearl Very Light Gray",
        235: "Reddish Gold",
        237: "Bionicle Copper",
        238: "Bionicle Gold",
        239: "Bionicle Silver",
        243: "Pearl Sand Purple",
        244: "Pearl Black",
        249: "Reddish Copper",
        252: "Pearl Red",
        253: "Pearl Green",
        254: "Pearl Blue",
        255: "Pearl Brown",
        
        # Metallic
        65: "Metallic Gold",
        67: "Metallic Silver",
        70: "Metallic Green",
        250: "Metallic Copper",
        
        # Glitter
        100: "Glitter Trans-Dark Pink",
        101: "Glitter Trans-Clear",
        102: "Glitter Trans-Purple",
        162: "Glitter Trans-Light Blue",
        163: "Glitter Trans-Neon Green",
        222: "Glitter Trans-Orange",
        
        # Satin
        170: "Satin Trans-Yellow",
        223: "Satin Trans-Light Blue",
        224: "Satin Trans-Dark Pink",
        228: "Satin Trans-Clear",
        229: "Satin Trans-Brown",
        230: "Satin Trans-Purple",
        232: "Satin Trans-Dark Blue",
        233: "Satin Trans-Bright Green",
        
        # Speckle
        111: "Speckle Black-Silver",
        116: "Speckle Black-Copper",
        117: "Speckle DBGray-Silver",
        151: "Speckle Black-Gold",
        
        # Glow
        118: "Glow In Dark Trans",
    }
    
    # BrickLink ColorId -> RGB Hex (without '#')
    ID_TO_RGB = {
        1: "FFFFFF",  # White
        2: "E4CD9E",  # Tan
        3: "F2CD37",  # Yellow
        4: "FE8A18",  # Orange
        5: "C91A09",  # Red
        6: "237841",  # Green
        7: "0055BF",  # Blue
        8: "583927",  # Brown
        9: "9BA19D",  # Light Gray
        10: "6D6E5C",  # Dark Gray
        11: "05131D",  # Black
        12: "FCFCFC",  # Trans-Clear
        13: "635F52",  # Trans-Brown
        14: "0020A0",  # Trans-Dark Blue
        15: "AEEFEC",  # Trans-Light Blue
        16: "F8F184",  # Trans-Neon Green
        17: "C91A09",  # Trans-Red
        18: "FF800D",  # Trans-Neon Orange
        19: "F5CD2F",  # Trans-Yellow
        20: "84B68D",  # Trans-Green
        21: "BBA53D",  # Chrome Gold
        22: "E0E0E0",  # Chrome Silver
        23: "FC97AC",  # Pink
        24: "81007B",  # Purple
        25: "F2705E",  # Salmon
        26: "FEBABD",  # Light Salmon
        27: "B31004",  # Rust
        28: "D09168",  # Nougat
        29: "FA9C1C",  # Earth Orange
        31: "FFA70B",  # Medium Orange
        32: "F9BA61",  # Light Orange
        33: "FBE696",  # Light Yellow
        34: "BBE90B",  # Lime
        35: "D9E4A7",  # Light Lime
        36: "4B9F4A",  # Bright Green
        37: "73DCA1",  # Medium Green
        38: "C2DAB8",  # Light Green
        39: "008F9B",  # Dark Turquoise
        40: "55A5AF",  # Light Turquoise
        41: "B3D7D1",  # Aqua
        42: "5A93DB",  # Medium Blue
        43: "4354A3",  # Violet
        44: "C9CAE2",  # Light Violet
        46: "D4D5C9",  # Glow In Dark Opaque
        47: "C870A0",  # Dark Pink
        48: "A0BCAC",  # Sand Green
        49: "E6E3DA",  # Very Light Gray
        50: "DF6695",  # Trans-Dark Pink
        51: "A5A5CB",  # Trans-Purple
        52: "6C96BF",  # Chrome Blue
        54: "845E84",  # Sand Purple
        55: "6074A1",  # Sand Blue
        56: "FECCCF",  # Light Pink
        57: "645A4C",  # Chrome Antique Brass
        58: "D67572",  # Sand Red
        59: "720E0F",  # Dark Red
        60: "FFFFFF",  # Milky White
        61: "DCBC81",  # Pearl Light Gold
        62: "B4D2E3",  # Light Blue
        63: "0A3463",  # Dark Blue
        64: "3CB371",  # Chrome Green
        65: "DBAC34",  # Metallic Gold
        66: "9CA3A8",  # Pearl Light Gray
        67: "A5A9B4",  # Metallic Silver
        68: "A95500",  # Dark Orange
        69: "958A73",  # Dark Tan
        70: "899B5F",  # Metallic Green
        71: "923978",  # Magenta
        72: "3592C3",  # Maersk Blue
        73: "6874CA",  # Medium Violet
        76: "C7D23C",  # Medium Lime
        77: "575857",  # Pearl Dark Gray
        78: "7988A1",  # Pearl Sand Blue
        80: "184632",  # Dark Green
        81: "B48455",  # Flat Dark Gold
        82: "AA4D8E",  # Chrome Pink
        83: "F2F3F2",  # Pearl White
        84: "AE7A59",  # Copper
        85: "6C6E68",  # Dark Bluish Gray
        86: "A0A5A9",  # Light Bluish Gray
        87: "7DBFDD",  # Sky Blue
        88: "582A12",  # Reddish Brown
        89: "3F3691",  # Dark Purple
        90: "F6D7B3",  # Light Nougat
        91: "7C503A",  # Light Brown
        93: "CD6298",  # Light Purple
        94: "F785B1",  # Medium Dark Pink
        95: "898788",  # Flat Silver
        96: "F3CF9B",  # Very Light Orange
        97: "4C61DB",  # Royal Blue
        98: "F08F1C",  # Trans-Orange
        99: "E6E3E0",  # Very Light Bluish Gray
        100: "DF6695",  # Glitter Trans-Dark Pink
        101: "FFFFFF",  # Glitter Trans-Clear
        102: "A5A5CB",  # Glitter Trans-Purple
        103: "FFF03A",  # Bright Light Yellow
        104: "E4ADC8",  # Bright Pink
        105: "9FC3E9",  # Bright Light Blue
        106: "B67B50",  # Fabuland Brown
        107: "E4ADC8",  # Trans-Pink
        108: "D9E4A7",  # Trans-Bright Green
        109: "2032B0",  # Dark Blue-Violet
        110: "F8BB3D",  # Bright Light Orange
        111: "05131D",  # Speckle Black-Silver
        113: "C1DFF0",  # Trans-Very Lt Blue
        114: "96709F",  # Trans-Light Purple
        115: "AA7F2E",  # Pearl Gold
        116: "05131D",  # Speckle Black-Copper
        117: "6C6E68",  # Speckle DBGray-Silver
        118: "BDC6AD",  # Glow In Dark Trans
        119: "ABADAC",  # Pearl Very Light Gray
        120: "352100",  # Dark Brown
        121: "DAB000",  # Trans-Neon Yellow
        122: "1B2A34",  # Chrome Black
        150: "AA7D55",  # Medium Nougat
        151: "05131D",  # Speckle Black-Gold
        152: "ADC3C0",  # Light Aqua
        153: "078BC9",  # Dark Azure
        154: "E1D5ED",  # Lavender
        155: "9B9A5A",  # Olive Green
        156: "36AEBF",  # Medium Azure
        157: "AC78BA",  # Medium Lavender
        158: "DFEEA5",  # Yellowish Green
        159: "D9D9D9",  # Glow in Dark White
        160: "EF9121",  # Fabuland Orange
        161: "DD982E",  # Curry
        162: "68BCC5",  # Glitter Trans-Light Blue
        163: "C0F500",  # Glitter Trans-Neon Green
        164: "FCB76D",  # Trans-Flame Yellowish Orange
        165: "EC4612",  # Neon Orange
        166: "D2FC43",  # Neon Green
        167: "CA4C0B",  # Reddish Orange
        168: "5E3F33",  # Umber Brown
        169: "915C3C",  # Sienna Brown
        170: "F5CD2F",  # Opal Trans-Yellow
        171: "FFF230",  # Duplo Lime
        172: "FFCB78",  # Warm Yellowish Orange
        220: "FF698F",  # Coral
        221: "94E5AB",  # Trans-Light Green
        222: "F08F1C",  # Glitter Trans-Orange
        223: "68BCC5",  # Opal Trans-Light Blue
        224: "CE1D9B",  # Opal Trans-Dark Pink
        225: "AD6140",  # Dark Nougat
        226: "C9E788",  # Trans-Light Bright Green
        227: "8E5597",  # Reddish Lilac
        228: "FCFCFC",  # Opal Trans-Clear
        229: "583927",  # Opal Trans-Brown
        230: "8320B7",  # Opal Trans-Purple
        231: "EE5434",  # Bright Reddish Orange
        232: "0020A0",  # Opal Trans-Dark Blue
        233: "84B68D",  # Opal Trans-Bright Green
        234: "8D73B3",  # Trans-Medium Purple
        235: "AC8247",  # Reddish Gold
        236: "EBD800",  # Vibrant Yellow
        237: "945148",  # Two-tone Copper
        238: "AB673A",  # Two-tone Gold
        239: "737271",  # Two-tone Silver
        240: "755945",  # Medium Brown
        241: "CCA373",  # Warm Tan
        242: "5D5C36",  # Dark Olive Green
        243: "6B5A5A",  # Pearl Sand Purple
        244: "0A1327",  # Pearl Black
        245: "9391E4",  # Medium Violet
        246: "9195CA",  # Light Lilac
        247: "009ECE",  # Duplo Blue
        248: "78FC78",  # Fabuland Lime
        249: "B46A00",  # Pearl Copper
        250: "764D3B",  # Metallic Copper
        251: "635F52",  # Trans-Black
        252: "D60026",  # Pearl Red
        253: "008E3C",  # Pearl Green
        254: "0059A3",  # Pearl Blue
        255: "57392C",  # Pearl Brown
    }
    
    @classmethod
    def get_color_name(cls, color_id: int) -> Optional[str]:
        """Get color name by BrickLink Color ID."""
        return cls.ID_TO_NAME.get(color_id)
    
    @classmethod
    def get_color_rgb(cls, color_id: int) -> Optional[str]:
        """Get RGB hex value (with #) by BrickLink Color ID."""
        hex_value = cls.ID_TO_RGB.get(color_id)
        return f"#{hex_value}" if hex_value else None
    
    @classmethod
    def get_all_colors(cls) -> Dict[int, Tuple[str, str]]:
        """
        Get all colors as dictionary.
        Returns: {color_id: (name, rgb_hex)}
        """
        result = {}
        for color_id in cls.ID_TO_NAME.keys():
            name = cls.get_color_name(color_id)
            rgb = cls.get_color_rgb(color_id)
            if name and rgb:
                result[color_id] = (name, rgb)
        return result
    
    @classmethod
    def is_not_applicable(cls, color_id: int) -> bool:
        """Check if color is 'Not Applicable'."""
        return color_id == 0
