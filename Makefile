.DEFAULT_GOAL := help
.PHONY: help init doctor dev build install test docs license-check content review
help init doctor dev build install test docs license-check content review:
	node scripts/tasks.mjs $@
