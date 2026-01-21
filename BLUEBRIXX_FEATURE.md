# Bluebrixx Import Feature

## Overview
The Bluebrixx Import feature allows users to directly import part lists from their Bluebrixx orders without the need to manually photograph and mark parts.

## How to Use

### 1. Navigate to the Bluebrixx Import Tab
Click on the "Bluebrixx Import" tab in the navigation menu.

### 2. Gather Required Information

You need three pieces of information:

#### Set Item Number
- Found in the Bluebrixx spare parts page URL
- Look for the `ccs_item` parameter
- Example: `108827`

#### Order Number
- Your Bluebrixx order number
- Example: `310329047`
- **Note**: This information is NOT stored on the server and is only used temporarily for the API request

#### Browser Cookie
You need to extract your browser cookie to authenticate the request:

**Method 1: Browser Developer Tools**
1. Open the Bluebrixx spare parts page in your browser
2. Press `F12` to open Developer Tools
3. Go to the **Network** tab
4. Reload the page
5. Find any request and look at the **Request Headers**
6. Copy the entire **Cookie** value

**Method 2: Cookie Editor Extension**
1. Install a browser extension like "Cookie Editor"
2. Navigate to Bluebrixx
3. Export cookies as a string
4. Paste into the form

### 3. Fetch Part List
1. Fill in all three fields
2. Click "Fetch Part List"
3. Wait for the request to complete

### 4. Download BrickLink XML
Once successful:
- You'll see a preview of all parts
- Click "Download as BrickLink XML" to get the file
- Import this XML file directly into BrickLink or use it with other tools

## Privacy & Security

### Data Handling
- **Order Number**: Used only for the API request, NOT stored on the server
- **Cookie**: Transmitted securely, NOT logged or saved
- **Set Item**: Only used for the request, discarded immediately after

### Why Cookies Are Needed
The Bluebrixx API requires authentication via cookies. This ensures:
- Only authenticated users can access their orders
- Part lists are fetched from your actual order data
- The system respects Bluebrixx's access controls

## Technical Details

### API Endpoint
```
POST /bluebrixx_fetch
```

**Request Body:**
```json
{
  "set_itemno": "108827",
  "order_no": "310329047",
  "cookie_header": "PHPSESSID=...; _ga=..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "part_count": 150,
  "parts": [
    {
      "form_nr": "3001",
      "article_nr": "500123",
      "color": "Black",
      "qty": 4
    }
  ]
}
```

### BrickLink XML Export
```
GET /bluebrixx_download_xml
```

Downloads XML in BrickLink Wanted List format:
```xml
<INVENTORY>
  <ITEM>
    <ITEMTYPE>P</ITEMTYPE>
    <ITEMID>3001</ITEMID>
    <COLOR>11</COLOR>
    <MINQTY>4</MINQTY>
  </ITEM>
</INVENTORY>
```

## Color Mapping
The system uses a comprehensive BrickLink color mapping table with 250+ colors, including:
- Standard colors (White, Black, Red, Blue, etc.)
- Transparent colors (Trans-Clear, Trans-Red, etc.)
- Special finishes (Chrome, Pearl, Metallic, etc.)
- Legacy colors (Fabuland, Bionicle, etc.)

## Troubleshooting

### "Could not find table" Error
- Ensure you're logged into Bluebrixx
- Check that the order contains the specified set
- Try refreshing the spare parts page

### "Network Error"
- Check your internet connection
- Verify the Order Number is correct
- Make sure your cookie is fresh (not expired)

### Parts Missing or Wrong
- Verify the Set Item Number matches the set in your order
- Check that you copied the complete cookie string
- Try re-fetching with a new cookie

### Invalid Color Warnings
If you see warnings about colors not found:
- The part will be skipped in the XML export
- This usually indicates a special or custom color
- Contact support if this affects many parts

## Integration with Existing Workflow

The Bluebrixx Import feature complements the existing image-based workflow:

1. **Quick Import**: Use Bluebrixx Import for sets you ordered
2. **Custom Sets**: Use Upload & Mark for non-Bluebrixx sets
3. **Verification**: Review tab works with both methods
4. **Export**: Both methods export to the same formats

## Future Enhancements

Planned improvements:
- Support for multiple sets in one order
- Automatic cookie refresh mechanism
- Direct integration with BrickIsBrick.com
- Saved order history (with user consent)
- Batch processing of multiple orders
