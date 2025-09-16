chrome.runtime.onInstalled.addListener(() => {
  console.log('Chrome extension installed');
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
});

// 탭 변경 감지
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
});

// 페이지 로드 완료 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Page loaded:', tab.url);
  }
});