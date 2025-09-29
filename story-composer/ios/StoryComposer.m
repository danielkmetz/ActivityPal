#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StoryComposer, NSObject)

RCT_EXTERN_METHOD(compose:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup { return NO; }

@end
