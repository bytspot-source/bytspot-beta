#!/usr/bin/env python3
"""Prints the UDID and name of an iPhone simulator on the newest iOS runtime.

Reads `xcrun simctl list devices available --json` on stdin. Kept in its own
file because passing the program on stdin (`python3 -`) collides with piping
the data in on stdin, and the data loses.
"""
import json
import re
import sys


def runtime_version(key):
    match = re.search(r'SimRuntime\.iOS-([0-9-]+)$', key)
    return tuple(int(part) for part in match.group(1).split('-')) if match else ()


def main():
    devices = json.load(sys.stdin)['devices']
    runtimes = sorted((key for key in devices if 'SimRuntime.iOS-' in key), key=runtime_version, reverse=True)
    for runtime in runtimes:
        for device in devices[runtime]:
            if device['name'].startswith('iPhone'):
                print(device['udid'])
                print(device['name'])
                return 0
    sys.stderr.write('No iPhone simulator is available on this runner.\n')
    return 1


if __name__ == '__main__':
    sys.exit(main())
