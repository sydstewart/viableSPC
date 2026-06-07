import requests
url = ("https://fingertips.phe.org.uk/api/all_data/csv/by_indicator_id"
       "?indicator_ids=92949&area_type_id=15&parent_area_type_id=167")
r = requests.get(url, timeout=30)
with open('dementia_eddr_england.csv', 'w') as f:
    f.write(r.text)