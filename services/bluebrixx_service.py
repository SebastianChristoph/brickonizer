"""
Bluebrixx Service - Fetch spare parts from Bluebrixx orders
"""
import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional


BLUEBRIXX_URL = "https://service.bluebrixx.com/de/ajax_add_sparParts.php"

# Hardcoded cookie from scraper.py - used for all requests
DEFAULT_COOKIE = "_ga=GA1.1.835894193.1753254896; _fbp=fb.1.1753254907409.656703894701556054; __cmpconsent85689=CQaTthgQaTthgAfXzBDECDFgAAAAAAAAAAigF5wAQF5gXnABAXmAAA; __cmpcccu85689=aCQaVljygBaXmAe01qxrQMiYEJjQpgFTUtMUsARBEFWkSwoGqkJg; cogi-affiliate-allowed=true; _clck=13gp4ky%5E2%5Eg2w%5E1%5E2030; PHPSESSID=mv23ikjsoecrnhpeueoks7vkh3; __kla_id=eyJjaWQiOiJNRE0xWldRM05UY3RNekU0WVMwME5ESXhMVGd4T1dZdFpXWmpOak01TmpRek56VXoifQ==; __smVID=873e83212d0dea37e5c9009ffc6fb869cebd4faea6866d28b58f8fbb613bcee4; cookie_consent_user_accepted=true; september_id=BRCJ0pnfWmGP3O3R; cf_clearance=FMO.PE1w5ITZgxsNxP2fUavwBWG1YsrLLv_2ecLrLCI-1768973347-1.2.1.1-NB2mj1Cw1ccvaEn2azl34n37XImtL6KoYm62PfHA1zaWcm3i3BqcF3L4go_YDE09oQ_Ha5Y1MXsQb6qKK_PkVDX5iyMqAxDLVoGdpuQPel9J05sQSJfF0ViRCi8J2_zxZx1Q88AGDOQNCkclQwITDOfyYuRHIubtIC9Cx2F9r7q_t7Cf_O4F63O3noW6DzWYeFWjgn1oUcePHG0XzfQpJBHgnQ88w7LVCGmC9Qxb_Ws; _gcl_gs=2.1.k1$i1768973346$u234048333; _gcl_aw=GCL.1768973348.CjwKCAiA7LzLBhAgEiwAjMWzCJy5N9OlqLWaxeOWjdWlnanuWtaBn7u1yMYpsRsm1Ksb7t1jW0fspBoCfZcQAvD_BwE; _gcl_au=1.1.1905716827.1762173532.450215766.1768972555.1768973349; _clsk=sxlgzj%5E1768973627290%5E17%5E1%5Ek.clarity.ms%2Fcollect; cookie_consent_level=%7B%22strictly-necessary%22%3Atrue%2C%22functionality%22%3Atrue%2C%22tracking%22%3Atrue%2C%22targeting%22%3Atrue%7D; _ga_08SZ5R3PP5=GS2.1.s1768972545$o13$g1$t1768973642$j44$l0$h742373254; _uetsid=843663c0f5d211f08323b79a832f45d0; _uetvid=bf5bfb50f68911f0a0801ba37582f8c6"


# BrickLink Color ID Mapping (ID -> Name)
BRICKLINK_COLOR_ID_TO_NAME = {
    0: "(Not Applicable)",
    1: "White", 2: "Tan", 3: "Yellow", 4: "Orange", 5: "Red", 6: "Green", 7: "Blue",
    8: "Brown", 9: "Light Gray", 10: "Dark Gray", 11: "Black", 12: "Trans-Clear",
    13: "Trans-Brown", 14: "Trans-Dark Blue", 15: "Trans-Light Blue", 16: "Trans-Neon Green",
    17: "Trans-Red", 18: "Trans-Neon Orange", 19: "Trans-Yellow", 20: "Trans-Green",
    21: "Chrome Gold", 22: "Chrome Silver", 23: "Pink", 24: "Purple", 25: "Salmon",
    26: "Light Salmon", 27: "Rust", 28: "Nougat", 29: "Earth Orange", 31: "Medium Orange",
    32: "Light Orange", 33: "Light Yellow", 34: "Lime", 35: "Light Lime", 36: "Bright Green",
    37: "Medium Green", 38: "Light Green", 39: "Dark Turquoise", 40: "Light Turquoise",
    41: "Aqua", 42: "Medium Blue", 43: "Violet", 44: "Light Violet", 46: "Glow In Dark Opaque",
    47: "Dark Pink", 48: "Sand Green", 49: "Very Light Gray", 50: "Trans-Dark Pink",
    51: "Trans-Purple", 52: "Chrome Blue", 54: "Sand Purple", 55: "Sand Blue", 56: "Rose Pink",
    57: "Chrome Antique Brass", 58: "Sand Red", 59: "Dark Red", 60: "Milky White",
    61: "Pearl Light Gold", 62: "Light Blue", 63: "Dark Blue", 64: "Chrome Green",
    65: "Metallic Gold", 66: "Pearl Light Gray", 67: "Metallic Silver", 68: "Dark Orange",
    69: "Dark Tan", 70: "Metallic Green", 71: "Magenta", 72: "Maersk Blue", 73: "Medium Violet",
    76: "Medium Lime", 77: "Pearl Dark Gray", 78: "Pearl Sand Blue", 80: "Dark Green",
    81: "Flat Dark Gold", 82: "Chrome Pink", 83: "Pearl White", 84: "Copper",
    85: "Dark Bluish Gray", 86: "Light Bluish Gray", 87: "Sky Blue", 88: "Reddish Brown",
    89: "Dark Purple", 90: "Light Nougat", 91: "Light Brown", 93: "Light Purple",
    94: "Medium Dark Pink", 95: "Flat Silver", 96: "Very Light Orange", 97: "Blue-Violet",
    98: "Trans-Orange", 99: "Very Light Bluish Gray", 100: "Glitter Trans-Dark Pink",
    101: "Glitter Trans-Clear", 102: "Glitter Trans-Purple", 103: "Bright Light Yellow",
    104: "Bright Pink", 105: "Bright Light Blue", 106: "Fabuland Brown", 107: "Trans-Pink",
    108: "Trans-Bright Green", 109: "Dark Blue-Violet", 110: "Bright Light Orange",
    111: "Speckle Black-Silver", 113: "Trans-Aqua", 114: "Trans-Light Purple", 115: "Pearl Gold",
    116: "Speckle Black-Copper", 117: "Speckle DBGray-Silver", 118: "Glow In Dark Trans",
    119: "Pearl Very Light Gray", 120: "Dark Brown", 121: "Trans-Neon Yellow", 122: "Chrome Black",
    150: "Medium Nougat", 151: "Speckle Black-Gold", 152: "Light Aqua", 153: "Dark Azure",
    154: "Lavender", 155: "Olive Green", 156: "Medium Azure", 157: "Medium Lavender",
    158: "Yellowish Green", 159: "Glow In Dark White", 160: "Fabuland Orange", 161: "Dark Yellow",
    162: "Glitter Trans-Light Blue", 163: "Glitter Trans-Neon Green", 164: "Trans-Light Orange",
    165: "Neon Orange", 166: "Neon Green", 167: "Reddish Orange", 168: "Umber", 169: "Sienna",
    170: "Satin Trans-Yellow", 171: "Lemon", 172: "Warm Yellowish Orange", 220: "Coral",
    221: "Trans-Light Green", 222: "Glitter Trans-Orange", 223: "Satin Trans-Light Blue",
    224: "Satin Trans-Dark Pink", 225: "Dark Nougat", 226: "Trans-Light Bright Green",
    227: "Clikits Lavender", 228: "Satin Trans-Clear", 229: "Satin Trans-Brown",
    230: "Satin Trans-Purple", 231: "Dark Salmon", 232: "Satin Trans-Dark Blue",
    233: "Satin Trans-Bright Green", 234: "Trans-Medium Purple", 235: "Reddish Gold",
    236: "Neon Yellow", 237: "Bionicle Copper", 238: "Bionicle Gold", 239: "Bionicle Silver",
    240: "Medium Brown", 241: "Medium Tan", 242: "Dark Olive Green", 243: "Pearl Sand Purple",
    244: "Pearl Black", 245: "Lilac", 246: "Light Lilac", 247: "Little Robots Blue",
    248: "Fabuland Lime", 249: "Reddish Copper", 250: "Metallic Copper", 251: "Trans-Black",
    252: "Pearl Red", 253: "Pearl Green", 254: "Pearl Blue", 255: "Pearl Brown",
}


# Reverse mapping: Color Name -> Color ID
COLOR_NAME_TO_ID = {name: color_id for color_id, name in BRICKLINK_COLOR_ID_TO_NAME.items()}


class BluebrixxService:
    """Service to fetch and process Bluebrixx spare parts"""
    
    @staticmethod
    def parse_pasted_text(pasted_text: str) -> List[Dict]:
        """
        Parse pasted text from Bluebrixx spare parts page (3 lines pro Datensatz).
        Zeile 1: ItemNr\tFormNo
        Zeile 2: Color\tDescription
        Zeile 3: Category\tQuantity
        """
        import re
        parts = []
        lines = [l.strip() for l in pasted_text.strip().split('\n') if l.strip()]
        i = 0
        while i + 2 < len(lines):
            # Zeile 1: ItemNr und FormNr
            tokens1 = re.split(r'\t+', lines[i])
            tokens1 = [t.strip() for t in tokens1 if t.strip()]
            item_nr = None
            form_nr = None
            if len(tokens1) >= 2:
                item_nr = tokens1[0]
                form_nr = tokens1[1]
            # Zeile 2: Color
            tokens2 = re.split(r'\t+', lines[i+1])
            color_name = tokens2[0].strip() if tokens2 else ''
            # Zeile 3: Quantity
            tokens3 = re.split(r'\t+', lines[i+2])
            qty = 0
            for token in reversed(tokens3):
                qty_clean = ''.join(c for c in token if c.isdigit())
                if qty_clean:
                    try:
                        qty = int(qty_clean)
                        break
                    except ValueError:
                        pass
            if item_nr and form_nr and color_name and qty > 0:
                parts.append({
                    "form_nr": form_nr,
                    "article_nr": item_nr,
                    "color": color_name,
                    "qty": qty,
                })
            i += 3
        return parts
    
    @staticmethod
    def fetch_spareparts_html(set_itemno: str, order_no: str, cookie_header: str = None) -> str:
        """
        Fetch the HTML response from ajax_add_sparParts.php.
        cookie_header: optional cookie string, uses DEFAULT_COOKIE if not provided
        """
        # Use default cookie if not provided
        if not cookie_header:
            cookie_header = DEFAULT_COOKIE
            
        # Convert cookie header to dict
        cookies = {}
        for part in cookie_header.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            k, v = part.split("=", 1)
            cookies[k] = v

        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://service.bluebrixx.com",
            "Referer": f"https://service.bluebrixx.com/de/contact_spareparts?ccs_item={set_itemno}&ccs_order={order_no}",
            "X-Requested-With": "XMLHttpRequest",
        }

        data = {
            "set_itemno": set_itemno,
            "mode": "addSparParts",
            "orderNo": order_no,
        }

        resp = requests.post(BLUEBRIXX_URL, headers=headers, cookies=cookies, data=data, timeout=30)
        resp.raise_for_status()
        return resp.text

    @staticmethod
    def parse_parts_from_html(html: str) -> List[Dict]:
        """
        Parse parts from HTML and return list of dicts:
        [
            {"form_nr": "3832", "article_nr": "500123", "color": "Black", "qty": 1},
            ...
        ]
        """
        soup = BeautifulSoup(html, "html.parser")

        table = soup.select_one("#setEx_list tbody")
        if table is None:
            raise RuntimeError("Could not find table #setEx_list - is the response correct?")

        parts = []

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue

            # Column 2: Article number
            article_nr = tds[1].get_text(strip=True)

            # Column 3: Form-Nr / Bricklink Color
            form_color_text = tds[2].get_text("\n", strip=True)
            lines = form_color_text.split("\n")
            form_nr = lines[0].strip() if lines else ""
            color_name = lines[1].strip() if len(lines) > 1 else ""

            # Column 5: Quantity per set
            qty_text = tds[4].get_text(strip=True)
            try:
                qty = int(qty_text)
            except ValueError:
                qty = 0

            if not form_nr:
                continue

            parts.append({
                "form_nr": form_nr,
                "article_nr": article_nr,
                "color": color_name,
                "qty": qty,
            })

        return parts

    @staticmethod
    def parts_to_bricklink_xml(parts: List[Dict]) -> str:
        """
        Convert parts list to BrickLink XML format.
        COLOR = BrickLink Color ID (as string)
        ITEMID = Form-Nr or Form-Nr-Article if Form-Nr starts with 'P'
        """
        root = ET.Element("INVENTORY")

        for p in parts:
            # Convert color name to Color ID
            color_name = p["color"]
            color_id = COLOR_NAME_TO_ID.get(color_name)
            
            # If color not found, skip or use fallback
            if color_id is None:
                print(f"Warning: Color '{color_name}' not found in BrickLink Color Map, skipping part {p['form_nr']}")
                continue
            
            # Item ID: For Form-Numbers starting with 'P', append article number
            form_nr = p["form_nr"]
            if form_nr.startswith("P"):
                item_id = f"{form_nr}-{p['article_nr']}"
            else:
                item_id = form_nr
            
            item = ET.SubElement(root, "ITEM")
            ET.SubElement(item, "ITEMTYPE").text = "P"
            ET.SubElement(item, "ITEMID").text = item_id
            ET.SubElement(item, "COLOR").text = str(color_id)
            ET.SubElement(item, "MINQTY").text = str(p["qty"])

        # Return nicely formatted XML
        xml_str = ET.tostring(root, encoding="unicode")
        return xml_str

    @staticmethod
    def get_partlist_from_text(pasted_text: str) -> Dict:
        """
        Parse pasted text from Bluebrixx and convert to BrickLink XML
        No HTTP request needed - user copies the table directly
        """
        try:
            parts = BluebrixxService.parse_pasted_text(pasted_text)
            
            if not parts:
                return {
                    'success': False,
                    'error': 'No valid parts found in pasted text. Make sure you copied the entire parts table from Bluebrixx.'
                }
            
            xml_str = BluebrixxService.parts_to_bricklink_xml(parts)
            
            return {
                'success': True,
                'parts': parts,
                'xml': xml_str,
                'part_count': len(parts)
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Parse error: {str(e)}'
            }

    @staticmethod
    def get_partlist(set_itemno: str, order_no: str, cookie_header: str = None) -> Dict:
        """
        Main method to get partlist from Bluebrixx
        Uses DEFAULT_COOKIE if cookie_header is not provided
        Returns dict with parts and XML
        """
        try:
            html = BluebrixxService.fetch_spareparts_html(set_itemno, order_no, cookie_header)
            parts = BluebrixxService.parse_parts_from_html(html)
            xml_str = BluebrixxService.parts_to_bricklink_xml(parts)
            
            return {
                'success': True,
                'parts': parts,
                'xml': xml_str,
                'part_count': len(parts)
            }
        except requests.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except RuntimeError as e:
            return {
                'success': False,
                'error': f'Parse error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }
