.DEFAULT_GOAL := help
.PHONY: help init doctor dev build install test test-db test-coverage test-coverage-db docs license-check content review
help init doctor dev build install test test-db test-coverage test-coverage-db docs license-check content review:
	node scripts/tasks.mjs $@
