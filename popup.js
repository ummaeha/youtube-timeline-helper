document.addEventListener('DOMContentLoaded', function() {
  const statusEl = document.getElementById('status');

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];

    if (currentTab.url.includes('youtube.com/watch')) {
      statusEl.textContent = '확장 프로그램이 활성화되었습니다';
      statusEl.style.background = '#e8f5e8';
      statusEl.style.color = '#2e7d32';
      statusEl.style.borderColor = '#4caf50';
    } else if (currentTab.url.includes('youtube.com')) {
      statusEl.textContent = '동영상 페이지로 이동하세요';
      statusEl.style.background = '#fff3e0';
      statusEl.style.color = '#ef6c00';
      statusEl.style.borderColor = '#ff9800';
    } else {
      statusEl.textContent = 'YouTube로 이동하세요';
      statusEl.style.background = '#ffebee';
      statusEl.style.color = '#c62828';
      statusEl.style.borderColor = '#f44336';
    }
  });
});