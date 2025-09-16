class YouTubeTimelineComments {
  constructor() {
    this.timelineComments = [];
    this.video = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.widgetPosition = { x: 20, y: 20 };
    this.init();
  }

  init() {
    if (window.location.href.includes('youtube.com/watch')) {
      this.waitForVideo();
      this.loadWidgetPosition();
      this.createUI();
      this.extractTimelineComments();
      this.setupEventListeners();
      this.setupDragAndDrop();
    }
  }

  waitForVideo() {
    const checkVideo = () => {
      this.video = document.querySelector('video');
      if (this.video) {
        console.log('YouTube video found');
      } else {
        setTimeout(checkVideo, 1000);
      }
    };
    checkVideo();
  }

  extractTimelineComments() {
    // 여러 관찰자 설정
    this.setupCommentObservers();

    // 저장된 댓글 로드
    this.loadFromStorage();

    // 초기 댓글 파싱
    setTimeout(() => this.parseComments(), 3000);

    // 주기적으로 댓글 파싱 (더 자주)
    setInterval(() => this.parseComments(), 3000);

    // 스크롤 이벤트 감지로 추가 댓글 로드
    this.setupScrollMonitoring();
  }

  setupCommentObservers() {
    const observer = new MutationObserver((mutations) => {
      let shouldParse = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              if (node.matches && (
                node.matches('ytd-comment-thread-renderer') ||
                node.matches('ytd-comment-renderer') ||
                node.querySelector('ytd-comment-thread-renderer') ||
                node.querySelector('ytd-comment-renderer')
              )) {
                shouldParse = true;
              }
            }
          });
        }
      });

      if (shouldParse) {
        setTimeout(() => this.parseComments(), 500);
      }
    });

    // 다양한 댓글 섹션 감지
    const waitForComments = () => {
      const commentsSections = [
        '#comments',
        'ytd-comments',
        '#contents.ytd-item-section-renderer',
        'ytd-comments-header-renderer',
        '#comment-teaser',
        'ytd-comments#comments'
      ];

      let found = false;

      commentsSections.forEach(selector => {
        const section = document.querySelector(selector);
        if (section && !section.hasAttribute('data-observer-attached')) {
          observer.observe(section, {
            childList: true,
            subtree: true,
            attributes: false
          });
          section.setAttribute('data-observer-attached', 'true');
          console.log(`Comments observer attached to: ${selector}`);
          found = true;
        }
      });

      if (!found) {
        console.log('No comments section found, retrying...');
        setTimeout(waitForComments, 2000);
      } else {
        this.parseComments();
      }
    };

    waitForComments();
  }

  setupScrollMonitoring() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // 댓글 섹션 근처에 있을 때만 파싱
        const commentsSection = document.querySelector('#comments');
        if (commentsSection) {
          const rect = commentsSection.getBoundingClientRect();
          if (rect.top < window.innerHeight + 1000) { // 댓글 섹션이 뷰포트 근처에 있을 때
            this.parseComments();
          }
        }
      }, 1000);
    });
  }

  parseComments() {
    // 파싱 상태 표시
    this.showLoadingIndicator(true);

    // 더 포괄적인 댓글 셀렉터
    const commentSelectors = [
      'ytd-comment-thread-renderer',
      'ytd-comment-renderer',
      '#comment #content-text',
      '.ytd-comment-renderer #content-text',
      'yt-formatted-string[id="content-text"]'
    ];

    let commentElements = [];
    commentSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      commentElements = [...commentElements, ...Array.from(elements)];
    });

    // 중복 제거
    commentElements = Array.from(new Set(commentElements));

    console.log('Found comment elements:', commentElements.length);

    const newTimelineComments = [];
    const processedComments = new Set(); // 중복 방지

    commentElements.forEach(commentEl => {
      try {
        // 댓글 내용 추출
        let contentEl, authorEl, content, author;

        // 댓글 스레드 렌더러인 경우
        if (commentEl.tagName === 'YTD-COMMENT-THREAD-RENDERER') {
          contentEl = commentEl.querySelector('#content-text') ||
                     commentEl.querySelector('yt-formatted-string[id="content-text"]');
          authorEl = commentEl.querySelector('#author-text') ||
                    commentEl.querySelector('a[id="author-text"]');
        }
        // 댓글 렌더러인 경우
        else if (commentEl.tagName === 'YTD-COMMENT-RENDERER') {
          contentEl = commentEl.querySelector('#content-text');
          authorEl = commentEl.querySelector('#author-text');
        }
        // 직접 컨텐츠 엘리먼트인 경우
        else if (commentEl.id === 'content-text') {
          contentEl = commentEl;
          authorEl = commentEl.closest('ytd-comment-renderer')?.querySelector('#author-text') ||
                    commentEl.closest('ytd-comment-thread-renderer')?.querySelector('#author-text');
        }

        if (contentEl && authorEl) {
          content = contentEl.textContent || contentEl.innerText || '';
          author = authorEl.textContent || authorEl.innerText || '';

          // 중복 댓글 체크
          const commentKey = `${author.trim()}-${content.trim()}`;
          if (processedComments.has(commentKey)) {
            return;
          }
          processedComments.add(commentKey);

          // 타임스탬프 추출 (더 정교한 패턴)
          const timestamps = this.extractAllTimestamps(content);

          if (timestamps.length > 0) {
            console.log('Processing comment with timestamps:', {
              author: author.trim(),
              content: content.trim(),
              timestamps
            });

            timestamps.forEach(timestamp => {
              const seconds = this.timeToSeconds(timestamp);
              if (seconds >= 0) { // 유효한 시간인지 확인
                newTimelineComments.push({
                  author: author.trim(),
                  content: content.trim(),
                  timestamp,
                  seconds,
                  element: commentEl,
                  isCustom: false,
                  dateFound: new Date().toISOString()
                });
              }
            });
          } else {
            // 타임스탬프가 없어도 댓글은 보관 (나중에 필터링 옵션으로 활용)
            console.log('Comment without timestamp:', {
              author: author.trim(),
              contentPreview: content.trim().substring(0, 50) + '...'
            });
          }
        }
      } catch (error) {
        console.warn('Error processing comment element:', error);
      }
    });

    // 새로운 댓글만 사용
    this.timelineComments = newTimelineComments;

    // 중복 제거 (같은 시간과 내용의 댓글)
    const uniqueComments = [];
    const seen = new Set();

    this.timelineComments.forEach(comment => {
      const key = `${comment.seconds}-${comment.content}-${comment.author}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueComments.push(comment);
      }
    });

    this.timelineComments = uniqueComments;
    this.timelineComments.sort((a, b) => a.seconds - b.seconds);

    this.updateTimelineUI();
    this.showLoadingIndicator(false);

    console.log(`Timeline comments parsed: ${this.timelineComments.length} total, ${newTimelineComments.length} new`);

    // 댓글이 없고 샘플도 없으면 샘플 추가
    if (this.timelineComments.length === 0) {
      this.addSampleComments();
    }
  }

  extractAllTimestamps(text) {
    const patterns = [
      // 표준 타임스탬프: 1:23, 12:34, 1:23:45
      /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?=\s|$|[^\d:])/g,
      // 시간 표기: 1h 23m, 23m 45s, 1h23m45s
      /(\d+)h\s*(\d+)m(?:\s*(\d+)s)?/gi,
      // 분:초 표기: 1분 23초, 23분, 1분23초
      /(\d+)분(?:\s*(\d+)초)?/g,
      // 초 단위: 123초
      /(\d+)초/g
    ];

    const timestamps = [];

    patterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let timeStr = '';

        switch (index) {
          case 0: // 표준 타임스탬프
            if (match[3]) { // h:m:s
              timeStr = `${match[1]}:${match[2]}:${match[3]}`;
            } else { // m:s
              timeStr = `${match[1]}:${match[2]}`;
            }
            break;
          case 1: // 1h 23m 45s
            const hours = parseInt(match[1]) || 0;
            const minutes = parseInt(match[2]) || 0;
            const seconds = parseInt(match[3]) || 0;
            timeStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            break;
          case 2: // 1분 23초
            const mins = parseInt(match[1]);
            const secs = parseInt(match[2]) || 0;
            timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
            break;
          case 3: // 123초
            const totalSecs = parseInt(match[1]);
            const m = Math.floor(totalSecs / 60);
            const s = totalSecs % 60;
            timeStr = `${m}:${s.toString().padStart(2, '0')}`;
            break;
        }

        if (timeStr && !timestamps.includes(timeStr)) {
          timestamps.push(timeStr);
        }
      }
    });

    return timestamps;
  }

  addSampleComments() {
    const sampleComments = [
      { timestamp: '0:30', content: '여기가 시작 부분이에요!', author: '샘플유저1' },
      { timestamp: '1:15', content: '이 부분 중요해요 1:15', author: '샘플유저2' },
      { timestamp: '2:45', content: '2:45에 핵심 내용이 나와요', author: '샘플유저3' }
    ];

    sampleComments.forEach(sample => {
      this.timelineComments.push({
        author: sample.author,
        content: sample.content,
        timestamp: sample.timestamp,
        seconds: this.timeToSeconds(sample.timestamp),
        isCustom: false,
        isSample: true
      });
    });

    this.timelineComments.sort((a, b) => a.seconds - b.seconds);
    this.updateTimelineUI();
    console.log('Added sample comments');
  }

  extractTimestamps(text) {
    const timestampRegex = /(?:(\d+):)?(\d{1,2}):(\d{2})/g;
    const matches = [];
    let match;

    while ((match = timestampRegex.exec(text)) !== null) {
      matches.push(match[0]);
    }

    return matches;
  }

  timeToSeconds(timeStr) {
    const parts = timeStr.split(':').reverse();
    let seconds = 0;

    seconds += parseInt(parts[0]) || 0;
    seconds += (parseInt(parts[1]) || 0) * 60;
    seconds += (parseInt(parts[2]) || 0) * 3600;

    return seconds;
  }

  createUI() {
    const uiContainer = document.createElement('div');
    uiContainer.id = 'timeline-comments-ui';
    uiContainer.style.top = `${this.widgetPosition.y}px`;
    uiContainer.style.right = `${this.widgetPosition.x}px`;

    uiContainer.innerHTML = `
      <div class="timeline-header drag-handle">
        <div class="header-content">
          <h3>타임라인 댓글</h3>
          <div class="drag-indicator">⋮⋮</div>
        </div>
        <button id="toggle-timeline" class="toggle-btn">열기</button>
      </div>
      <div class="timeline-content" style="display: none;">
        <div class="timeline-controls">
          <button id="prev-2s" class="nav-btn">◀◀ -2초</button>
          <button id="next-2s" class="nav-btn">+2초 ▶▶</button>
        </div>
        <div class="loading-indicator" style="display: none;">
          <div class="loading-content">
            <div class="spinner"></div>
            <span>댓글을 분석 중...</span>
          </div>
        </div>
        <div class="timeline-list"></div>
      </div>
    `;

    document.body.appendChild(uiContainer);
  }

  updateTimelineUI() {
    const listContainer = document.querySelector('.timeline-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    this.timelineComments.forEach((comment, index) => {
      const commentEl = document.createElement('div');
      commentEl.className = 'timeline-comment-item';
      commentEl.innerHTML = `
        <div class="comment-time" data-seconds="${comment.seconds}">${comment.timestamp}</div>
        <div class="comment-author">${comment.author}</div>
        <div class="comment-content">${comment.content}</div>
        <button class="jump-btn" data-seconds="${comment.seconds}">이동</button>
      `;
      listContainer.appendChild(commentEl);
    });
  }

  setupEventListeners() {
    document.getElementById('toggle-timeline')?.addEventListener('click', () => {
      const content = document.querySelector('.timeline-content');
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      document.getElementById('toggle-timeline').textContent = isVisible ? '열기' : '닫기';
    });

    document.getElementById('prev-2s')?.addEventListener('click', () => {
      if (this.video) {
        this.video.currentTime = Math.max(0, this.video.currentTime - 2);
      }
    });

    document.getElementById('next-2s')?.addEventListener('click', () => {
      if (this.video) {
        this.video.currentTime = this.video.currentTime + 2;
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('jump-btn')) {
        const seconds = parseFloat(e.target.dataset.seconds);
        if (this.video) {
          this.video.currentTime = seconds;
        }
      }
    });

    // 비디오 이벤트 리스너 설정 (지연 실행)
    setTimeout(() => {
      this.video = document.querySelector('video');
      if (this.video) {
        this.video.addEventListener('timeupdate', () => {
          this.highlightCurrentComment();
        });
        console.log('Video event listeners attached');
      }
    }, 3000);
  }


  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  highlightCurrentComment() {
    if (!this.video) return;

    const currentTime = this.video.currentTime;
    const commentItems = document.querySelectorAll('.timeline-comment-item');

    commentItems.forEach(item => {
      const timeEl = item.querySelector('.comment-time');
      const seconds = parseFloat(timeEl.dataset.seconds);

      if (Math.abs(currentTime - seconds) < 3) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  saveToStorage() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (videoId) {
      chrome.storage.local.set({
        [`timeline_comments_${videoId}`]: this.timelineComments.filter(c => c.isCustom)
      });
    }
  }

  loadFromStorage() {
    // 사용자 추가 댓글 기능을 제거했으므로 빈 함수로 유지
  }

  loadWidgetPosition() {
    chrome.storage.local.get(['widget_position'], (result) => {
      if (result.widget_position) {
        this.widgetPosition = result.widget_position;
      }
    });
  }

  saveWidgetPosition() {
    chrome.storage.local.set({
      widget_position: this.widgetPosition
    });
  }

  setupDragAndDrop() {
    const widget = document.getElementById('timeline-comments-ui');
    const header = widget.querySelector('.drag-handle');

    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('#toggle-timeline')) return;

      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startTop = rect.top;

      widget.classList.add('dragging');
      document.body.style.userSelect = 'none';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newRight = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, startRight - deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, startTop + deltaY));

      widget.style.right = `${newRight}px`;
      widget.style.top = `${newTop}px`;

      this.widgetPosition.x = newRight;
      this.widgetPosition.y = newTop;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        widget.classList.remove('dragging');
        document.body.style.userSelect = '';
        this.saveWidgetPosition();
      }
    });

    // 터치 이벤트 지원
    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('#toggle-timeline')) return;

      this.isDragging = true;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      const rect = widget.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startTop = rect.top;

      widget.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      const newRight = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, startRight - deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, startTop + deltaY));

      widget.style.right = `${newRight}px`;
      widget.style.top = `${newTop}px`;

      this.widgetPosition.x = newRight;
      this.widgetPosition.y = newTop;

      e.preventDefault();
    });

    document.addEventListener('touchend', () => {
      if (this.isDragging) {
        this.isDragging = false;
        widget.classList.remove('dragging');
        this.saveWidgetPosition();
      }
    });
  }

  showLoadingIndicator(show) {
    const indicator = document.querySelector('.loading-indicator');
    if (indicator) {
      indicator.style.display = show ? 'block' : 'none';
    }
  }
}

// 페이지 로드 시 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new YouTubeTimelineComments();
  });
} else {
  new YouTubeTimelineComments();
}

// SPA 네비게이션 감지
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes('youtube.com/watch')) {
      setTimeout(() => new YouTubeTimelineComments(), 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });