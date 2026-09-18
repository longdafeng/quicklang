#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

/// Copy an accessibility attribute into ARC ownership; unavailable attributes are nil.
static id attribute(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, name, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}

/// Walk only the target application's bounded accessibility subtree.
static AXUIElementRef findElement(AXUIElementRef root, BOOL (^matches)(AXUIElementRef), int depth) {
    if (depth > 24) return NULL;
    if (matches(root)) return (AXUIElementRef)CFRetain(root);
    for (id child in attribute(root, kAXChildrenAttribute)) {
        AXUIElementRef found = findElement((__bridge AXUIElementRef)child, matches, depth + 1);
        if (found) return found;
    }
    return NULL;
}

/// Match visible labels without depending on a particular accessibility label attribute.
static NSString *label(AXUIElementRef element) {
    NSMutableArray *parts = [NSMutableArray array];
    for (id key in @[(__bridge id)kAXTitleAttribute, (__bridge id)kAXDescriptionAttribute,
                     (__bridge id)kAXValueAttribute]) {
        id value = attribute(element, (__bridge CFStringRef)key);
        if ([value isKindOfClass:NSString.class]) [parts addObject:value];
    }
    return [parts componentsJoinedByString:@" "];
}

/// Locate a role with a known English or Simplified Chinese label.
static AXUIElementRef named(AXUIElementRef app, NSString *role, NSArray<NSString *> *names) {
    return findElement(app, ^BOOL(AXUIElementRef element) {
        if (![attribute(element, kAXRoleAttribute) isEqual:role]) return NO;
        for (id key in @[(__bridge id)kAXTitleAttribute, (__bridge id)kAXDescriptionAttribute,
                         (__bridge id)kAXValueAttribute]) {
            id value = attribute(element, (__bridge CFStringRef)key);
            if ([value isKindOfClass:NSString.class] && [names containsObject:value]) return YES;
        }
        return NO;
    }, 0);
}

/// Activate a known element and release the retained search result.
static BOOL press(AXUIElementRef element) {
    if (!element) return NO;
    BOOL ok = AXUIElementPerformAction(element, kAXPressAction) == kAXErrorSuccess;
    CFRelease(element);
    return ok;
}

/// Download only the verified enhanced row; unknown layouts stop for manual operation.
static BOOL downloadRow(AXUIElementRef row) {
    NSString *text = label(row);
    if (![text containsString:@"Download"] && ![text containsString:@"下载"]) return NO;
    // Prefer a semantic download action when exposed by macOS.
    CFArrayRef actions = NULL;
    if (AXUIElementCopyActionNames(row, &actions) == kAXErrorSuccess) {
        for (NSString *action in (__bridge NSArray *)actions) {
            if ([action.lowercaseString containsString:@"download"]) {
                BOOL ok = AXUIElementPerformAction(row, (__bridge CFStringRef)action) == kAXErrorSuccess;
                CFRelease(actions);
                return ok;
            }
        }
        CFRelease(actions);
    }
    // macOS 15 exposes the cloud inside a row without an AX button. Use its row-relative
    // position only for the observed compact voice-list geometry and a foreground window.
    id position = attribute(row, kAXPositionAttribute), size = attribute(row, kAXSizeAttribute);
    CGPoint origin; CGSize dimensions;
    if (!position || !size || CFGetTypeID((__bridge CFTypeRef)position) != AXValueGetTypeID()
        || CFGetTypeID((__bridge CFTypeRef)size) != AXValueGetTypeID()) return NO;
    if (!AXValueGetValue((__bridge AXValueRef)position, kAXValueCGPointType, &origin)
        || !AXValueGetValue((__bridge AXValueRef)size, kAXValueCGSizeType, &dimensions)) return NO;
    if (dimensions.width < 500 || dimensions.width > 600 || dimensions.height < 45 || dimensions.height > 65) return NO;
    CGPoint point = CGPointMake(origin.x + dimensions.width - 72, origin.y + dimensions.height / 2);
    CGEventRef down = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
    CGEventRef up = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
    if (!down || !up) { if (down) CFRelease(down); if (up) CFRelease(up); return NO; }
    CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up);
    CFRelease(down); CFRelease(up);
    return YES;
}

/// Attempt a bounded VoiceOver Utility download without enabling VoiceOver or changing its voice.
/// Return 0 for missing permission, 1 for a clicked download, and 2 for manual fallback.
int quicklang_download_voice(void) {
    @autoreleasepool {
        if (!AXIsProcessTrusted()) return 0;
        NSURL *url = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:@"com.apple.VoiceOverUtility"];
        if (!url) return 2;
        NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
        [NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:configuration completionHandler:nil];
        NSRunningApplication *utility = nil;
        for (int attempt = 0; attempt < 20 && !utility; attempt++) {
            [NSThread sleepForTimeInterval:0.2];
            utility = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.VoiceOverUtility"].firstObject;
        }
        if (!utility) return 2;
        AXUIElementRef app = AXUIElementCreateApplication(utility.processIdentifier);
        AXUIElementSetMessagingTimeout(app, 1);
        BOOL clicked = NO;
        BOOL searched = NO;
        for (int step = 0; step < 16; step++) {
            [NSThread sleepForTimeInterval:0.4];
            if (![NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier isEqual:utility.bundleIdentifier]) break;
            AXUIElementRef list = named(app, @"AXList", @[@"Voice List", @"声音列表", @"音色列表"]);
            if (list) {
                if (!searched) {
                    id scope = attribute(list, kAXParentAttribute);
                    AXUIElementRef search = NULL;
                    // Search near the voice list, never the utility's unrelated toolbar search.
                    for (int level = 0; scope && level < 3 && !search; level++) {
                        search = findElement((__bridge AXUIElementRef)scope, ^BOOL(AXUIElementRef element) {
                            return [attribute(element, kAXRoleAttribute) isEqual:@"AXTextField"];
                        }, 0);
                        scope = attribute((__bridge AXUIElementRef)scope, kAXParentAttribute);
                    }
                    CFRelease(list);
                    if (!search) break;
                    searched = AXUIElementSetAttributeValue(search, kAXValueAttribute, CFSTR("Nathan")) == kAXErrorSuccess;
                    CFRelease(search);
                    if (!searched) break;
                    continue;
                }
                AXUIElementRef row = findElement(list, ^BOOL(AXUIElementRef element) {
                    NSString *text = label(element);
                    return [attribute(element, kAXRoleAttribute) isEqual:@"AXRow"]
                        && ([text containsString:@"Nathan (Enhanced)"] || [text containsString:@"Nathan（增强"]);
                }, 0);
                CFRelease(list);
                if (!row) break;
                clicked = downloadRow(row); CFRelease(row); break;
            }
            AXUIElementRef picker = findElement(app, ^BOOL(AXUIElementRef element) {
                NSString *text = label(element);
                return [attribute(element, kAXRoleAttribute) isEqual:@"AXButton"]
                    && ([text hasPrefix:@"Voice,"] || [text hasPrefix:@"Voice "] || [text hasPrefix:@"声音,"]);
            }, 0);
            if (press(picker)) continue;
            AXUIElementRef voice = findElement(app, ^BOOL(AXUIElementRef element) {
                NSString *text = label(element);
                return [attribute(element, kAXRoleAttribute) isEqual:@"AXButton"]
                    && ([text containsString:@"English (United States)"] || [text containsString:@"英语（美国）"]);
            }, 0);
            if (press(voice)) continue;
            AXUIElementRef speech = named(app, @"AXStaticText", @[@"Speech", @"语音"]);
            if (!speech) break;
            id cell = attribute(speech, kAXParentAttribute); CFRelease(speech);
            id row = cell ? attribute((__bridge AXUIElementRef)cell, kAXParentAttribute) : nil;
            if (!row || AXUIElementSetAttributeValue((__bridge AXUIElementRef)row, kAXSelectedAttribute, kCFBooleanTrue) != kAXErrorSuccess) break;
        }
        CFRelease(app);
        return clicked ? 1 : 2;
    }
}
