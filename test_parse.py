from services.bluebrixx_service import BluebrixxService

# Sample text from user's example
test_text = """	500024	3832
Black	PLATE 2X10
PLATES	1	
	500042	98138
Trans-Orange	FLAT TILE 1X1, ROUND
PLATES, SPECIAL CIRCLES AND ANGLES	4	
	500044	2432
Black	CLAMP 1X2
PLATES, SPECIAL	2"""

print("=== DEBUG ===")
lines = test_text.strip().split('\n')
for i, line in enumerate(lines):
    print(f"Line {i}: {repr(line)}")

print("\n=== PARSING ===")
result = BluebrixxService.get_partlist_from_text(test_text)
print(f"Success: {result['success']}")
if result['success']:
    print(f"Found {result['part_count']} parts")
    for p in result['parts'][:3]:
        print(f"  - {p['form_nr']} ({p['color']}) x{p['qty']}")
else:
    print(f"Error: {result['error']}")

