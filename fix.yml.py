import re
with open("src/main/resources/application.yml", "r", encoding="utf-8") as f:
    content = f.read()
# Normalize line endings
content = content.replace("\r\n", "\n")
# Remove the duplicate mqtt topics block at the end
content = re.sub(r"\nmqtt:\n  topics:\n    subscribe:.*?\n    publish-cmd:.*", "", content, flags=re.DOTALL)
# Insert topics under the first mqtt section after max-delay: 10000
content = content.replace(
    "max-delay: 10000\n\nlogging:",
    "max-delay: 10000\n  topics:\n    subscribe: \"smoke/+/data,smoke/+/heartbeat\"\n    publish-cmd: \"smoke/%s/cmd\"\n\nlogging:"
)
with open("src/main/resources/application.yml", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed YAML - single mqtt section with broker + topics")
