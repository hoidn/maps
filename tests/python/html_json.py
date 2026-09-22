"""Read the ID.textContent JSON interface without assuming a script root."""
from html.parser import HTMLParser
import json


def read_json(source, identity):
    class Reader(HTMLParser):
        depth = 0
        found = False

        def handle_starttag(self, tag, attrs):
            if self.depth:
                self.depth += 1
            elif dict(attrs).get('id') == identity:
                self.depth = 1
                self.found = True

        def handle_endtag(self, tag):
            if self.depth:
                self.depth -= 1

        def handle_data(self, data):
            if self.depth:
                parts.append(data)

    parts = []
    reader = Reader()
    reader.feed(source)
    reader.close()
    if not reader.found:
        raise ValueError('Missing JSON element: ' + identity)
    return json.loads(''.join(parts))
