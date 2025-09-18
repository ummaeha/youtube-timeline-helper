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
          <button id="add-comment-mode" class="nav-btn add-comment-btn">댓글 추가</button>
        </div>
        <div class="loading-indicator" style="display: none;">
          <div class="loading-content">
            <div class="spinner"></div>
            <span>댓글을 로딩 중...</span>
          </div>
        </div>
        <div class="timeline-list"></div>
        <div class="comment-input-mode" style="display: none;">
          <div class="comment-input-header">
            <h4>댓글 추가</h4>
            <button id="close-comment-mode" class="close-btn">×</button>
          </div>
          <div class="current-time-display">
            <span class="time-label">현재 시간:</span>
            <span id="current-video-time" class="current-time">0:00</span>
          </div>
          <div class="comment-input-container">
            <textarea 
              id="comment-textarea" 
              placeholder="댓글을 입력하세요... (예: 1:23 이 부분이 중요해요)"
              rows="4"
            ></textarea>
            <div class="comment-input-actions">
              <button id="submit-comment" class="submit-btn">댓글 작성</button>
              <button id="cancel-comment" class="cancel-btn">취소</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(uiContainer);
  }

  updateTimelineUI() {
    const listContainer = document.querySelector('.timeline-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (this.timelineComments.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.innerHTML = `
        <div class="empty-icon">💬</div>
        <div class="empty-text">타임스탬프가 포함된 댓글이 없습니다</div>
        <div class="empty-subtext">댓글에 시간 정보(예: 1:23, 2분 30초)를 포함해주세요</div>
      `;
      listContainer.appendChild(emptyMessage);
      return;
    }

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

    // 댓글 추가 모드 토글
    document.getElementById('add-comment-mode')?.addEventListener('click', () => {
      this.toggleCommentInputMode();
    });

    // 댓글 입력 모드 닫기
    document.getElementById('close-comment-mode')?.addEventListener('click', () => {
      this.closeCommentInputMode();
    });

    // 댓글 취소
    document.getElementById('cancel-comment')?.addEventListener('click', () => {
      this.closeCommentInputMode();
    });

    // 댓글 제출
    document.getElementById('submit-comment')?.addEventListener('click', () => {
      this.submitComment();
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

  toggleCommentInputMode() {
    const timelineList = document.querySelector('.timeline-list');
    const commentInputMode = document.querySelector('.comment-input-mode');
    const addCommentBtn = document.getElementById('add-comment-mode');

    if (commentInputMode.style.display === 'none') {
      // 댓글 입력 모드로 전환
      timelineList.style.display = 'none';
      commentInputMode.style.display = 'block';
      addCommentBtn.textContent = '댓글 목록';
      addCommentBtn.classList.add('active');
      
      // 현재 시간 업데이트
      this.updateCurrentTimeDisplay();
      
      // 주기적으로 시간 업데이트
      this.timeUpdateInterval = setInterval(() => {
        this.updateCurrentTimeDisplay();
      }, 1000);
    } else {
      this.closeCommentInputMode();
    }
  }

  closeCommentInputMode() {
    const timelineList = document.querySelector('.timeline-list');
    const commentInputMode = document.querySelector('.comment-input-mode');
    const addCommentBtn = document.getElementById('add-comment-mode');

    timelineList.style.display = 'block';
    commentInputMode.style.display = 'none';
    addCommentBtn.textContent = '댓글 추가';
    addCommentBtn.classList.remove('active');

    // 시간 업데이트 인터벌 정리
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }

    // 입력창 초기화
    const textarea = document.getElementById('comment-textarea');
    if (textarea) {
      textarea.value = '';
    }
  }

  updateCurrentTimeDisplay() {
    if (!this.video) return;

    const currentTimeEl = document.getElementById('current-video-time');
    if (currentTimeEl) {
      const currentTime = this.video.currentTime;
      const formattedTime = this.formatTime(currentTime);
      currentTimeEl.textContent = formattedTime;
    }
  }

  async submitComment() {
    const textarea = document.getElementById('comment-textarea');
    const commentText = textarea.value.trim();

    if (!commentText) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    if (!this.video) {
      alert('비디오를 찾을 수 없습니다.');
      return;
    }

    try {
      // 댓글 섹션으로 스크롤
      await this.scrollToCommentsSection();
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // YouTube 댓글 작성란 찾기
      const commentBox = await this.findYouTubeCommentBox();
      if (!commentBox) {
        alert('YouTube 댓글 작성란을 찾을 수 없습니다. 댓글 섹션으로 스크롤해주세요.');
        return;
      }

      // 현재 시간을 댓글 앞에 추가
      const currentTime = this.formatTime(this.video.currentTime);
      const fullCommentText = `${currentTime} ${commentText}`;

      // 댓글 작성란에 텍스트 입력
      await this.fillCommentBox(commentBox, fullCommentText);

      // 댓글 작성 버튼 클릭
      await this.clickCommentSubmitButton();

      // 성공 메시지
      alert('댓글이 작성되었습니다!');
      
      // 입력 모드 닫기
      this.closeCommentInputMode();

    } catch (error) {
      console.error('댓글 작성 중 오류:', error);
      alert('댓글 작성에 실패했습니다. 다시 시도해주세요.');
    }
  }

  async findYouTubeCommentBox() {
    // 실제 YouTube DOM 구조 기반 selector들 (2025년 1월 기준)
    // 먼저 placeholder area를 찾아서 활성화시키고, 그 다음에 contenteditable을 찾는다

    // 1단계: placeholder area 선택자들
    const placeholderSelectors = [
      '#placeholder-area',
      'ytd-comment-simplebox-renderer #placeholder-area',
      'yt-formatted-string#simplebox-placeholder',
      'ytd-comment-simplebox-renderer yt-formatted-string[role="textbox"]',
      '#simplebox-placeholder',
      '[role="textbox"][tabindex="0"]'
    ];

    // 2단계: 활성화된 후 나타나는 contenteditable 선택자들
    const contentEditableSelectors = [
      // 가장 정확한 selector - 실제 DOM 구조 기반
      'yt-formatted-string#contenteditable-textarea #contenteditable-root',
      'ytd-commentbox yt-formatted-string #contenteditable-root',
      'yt-formatted-string[id="contenteditable-textarea"] #contenteditable-root',

      // ID 기반 (가장 안정적)
      '#contenteditable-root[contenteditable="true"]',
      '#contenteditable-root',

      // 실제 DOM 경로 기반
      'ytd-commentbox ytd-emoji-input yt-user-mention-autosuggest-input yt-formatted-string #contenteditable-root',
      'ytd-commentbox ytd-emoji-input #contenteditable-root',
      'ytd-emoji-input yt-formatted-string #contenteditable-root',

      // aria-label 기반 (한국어/영어)
      'div[contenteditable="true"][aria-label*="댓글 추가"]',
      'div[contenteditable="true"][aria-label*="Add a comment"]',
      'div[contenteditable="true"][aria-label*="공개 댓글"]',
      'div[contenteditable="true"][aria-label*="Add a public comment"]',

      // 클래스와 속성 조합
      'div[contenteditable="true"].style-scope.yt-formatted-string',
      '.style-scope.yt-formatted-string div[contenteditable="true"]',

      // 폴백 selector들
      'ytd-commentbox div[contenteditable="true"]',
      'ytd-comment-simplebox-renderer div[contenteditable="true"]',

      // 댓글 영역 내의 모든 contenteditable
      '#comments div[contenteditable="true"]',
      'ytd-comments div[contenteditable="true"]',

      // 최후의 수단
      'div[contenteditable="true"]:not([aria-hidden="true"])'
    ];

    console.log('Searching for YouTube comment input in 2 steps...');

    // 1단계: placeholder area 활성화 시도
    let placeholderActivated = false;
    for (const selector of placeholderSelectors) {
      const placeholderElements = document.querySelectorAll(selector);
      console.log(`Placeholder selector "${selector}" found ${placeholderElements.length} elements`);

      for (const placeholderEl of placeholderElements) {
        if (placeholderEl.offsetParent !== null) {
          console.log('Attempting to activate placeholder:', selector, placeholderEl);

          // placeholder 영역 클릭
          placeholderEl.click();
          placeholderEl.focus();

          // 약간의 지연 후 contenteditable이 나타나는지 확인
          await new Promise(resolve => setTimeout(resolve, 500));
          placeholderActivated = true;
          break;
        }
      }
      if (placeholderActivated) break;
    }

    // 2단계: contenteditable 요소 찾기
    const selectors = contentEditableSelectors;

    console.log('Searching for comment input box with', selectors.length, 'selectors');

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);

      for (const element of elements) {
        console.log('Checking element:', {
          selector,
          tagName: element.tagName,
          contentEditable: element.contentEditable,
          ariaLabel: element.getAttribute('aria-label'),
          placeholder: element.getAttribute('placeholder'),
          isVisible: element.offsetParent !== null,
          isCommentInput: this.isCommentInputElement(element)
        });

        // 보이는 요소이고, 댓글 입력과 관련된 요소인지 확인
        if (element.offsetParent !== null && this.isCommentInputElement(element)) {
          console.log('Found comment input element:', selector, element);
          return element;
        }
      }
    }

    console.log('No comment input element found after checking all selectors');
    return null;
  }

  isCommentInputElement(element) {
    // 더 정확한 댓글 입력 요소 검증 로직
    if (!element || element.disabled) return false;

    const text = element.textContent || element.innerText || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const dataPlaceholder = element.getAttribute('data-placeholder') || '';
    const role = element.getAttribute('role') || '';
    const id = element.getAttribute('id') || '';

    // 1. 편집 가능 여부 확인
    const isEditable = element.contentEditable === 'true' || role === 'textbox';
    if (!isEditable) return false;

    // 2. 가시성 확인
    const isVisible = element.offsetParent !== null &&
                      element.offsetWidth > 10 &&
                      element.offsetHeight > 10 &&
                      !element.hidden &&
                      element.style.display !== 'none';
    if (!isVisible) return false;

    // 3. 댓글 섹션 내부에 있는지 확인 (가장 중요)
    const isInCommentSection = element.closest('ytd-comment-simplebox-renderer') ||
                               element.closest('ytd-commentbox') ||
                               element.closest('yt-commentbox') ||
                               element.closest('#comments') ||
                               element.closest('ytd-comments');

    // 4. 댓글 관련 키워드 확인
    const commentKeywords = [
      '댓글', 'comment', 'add a comment', '댓글 추가', '댓글을 추가',
      '공개 댓글', 'public comment', 'add a public comment',
      '의견을 추가', 'share your thoughts', 'thoughts'
    ];

    const allText = (text + ' ' + placeholder + ' ' + ariaLabel + ' ' + dataPlaceholder + ' ' + id).toLowerCase();

    const hasCommentKeyword = commentKeywords.some(keyword =>
      allText.includes(keyword.toLowerCase())
    );

    // 5. 특정 ID나 클래스 확인
    const hasCommentId = id.includes('content') || id.includes('comment') || id.includes('placeholder');

    // 모든 조건을 종합하여 판단
    return isInCommentSection && (hasCommentKeyword || hasCommentId || allText.includes('comment'));
  }

  async fillCommentBox(commentBox, text) {
    try {
      console.log('Filling comment box with text:', text);

      // 1. 포커스 주기
      commentBox.focus();
      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. 기존 내용 클리어
      commentBox.textContent = '';
      commentBox.innerText = '';

      // 3. 텍스트 입력을 위한 여러 방법 시도
      await this.insertTextIntoElement(commentBox, text);

      // 4. 입력 이벤트 발생시켜서 YouTube가 인식하도록 함
      this.triggerInputEvents(commentBox);

      // 5. 약간의 지연으로 UI 업데이트 대기
      await new Promise(resolve => setTimeout(resolve, 300));

      console.log('Comment box filled successfully');

    } catch (error) {
      console.error('Error filling comment box:', error);
      throw error;
    }
  }

  async insertTextIntoElement(element, text) {
    console.log('Inserting text into element:', element, text);

    // 방법 1: 직접 텍스트 설정 (가장 확실한 방법)
    try {
      element.focus();
      element.textContent = text;
      element.innerText = text;

      // innerHTML도 설정 (YouTube가 이를 인식할 수 있도록)
      element.innerHTML = text;

      console.log('Direct text setting successful');
      return;
    } catch (e) {
      console.log('Direct text setting failed, trying other methods');
    }

    // 방법 2: Input 이벤트와 함께 텍스트 설정
    try {
      element.focus();

      // 텍스트를 한 글자씩 입력하는 시뮬레이션
      element.textContent = '';
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        element.textContent += char;

        // input 이벤트 발생
        const inputEvent = new InputEvent('input', {
          data: char,
          inputType: 'insertText',
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(inputEvent);

        await new Promise(resolve => setTimeout(resolve, 5));
      }

      console.log('Character-by-character insertion successful');
      return;
    } catch (e) {
      console.log('Character insertion failed, trying clipboard method');
    }

    // 방법 3: Clipboard API 사용
    try {
      element.focus();

      // 클립보드에 텍스트 복사
      await navigator.clipboard.writeText(text);

      // 붙여넣기 이벤트 시뮬레이션
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true
      });

      // clipboardData에 텍스트 설정
      pasteEvent.clipboardData.setData('text/plain', text);
      element.dispatchEvent(pasteEvent);

      console.log('Clipboard method successful');
      return;
    } catch (e) {
      console.error('All text insertion methods failed:', e);
      // 최후의 수단으로 직접 설정
      element.textContent = text;
    }
  }

  triggerInputEvents(element) {
    console.log('Triggering input events for YouTube recognition');

    // YouTube가 텍스트 변경을 인식하도록 다양한 이벤트 발생
    const events = [
      // 포커스 이벤트
      new FocusEvent('focus', { bubbles: true, cancelable: true }),

      // 입력 이벤트
      new InputEvent('input', {
        inputType: 'insertText',
        bubbles: true,
        cancelable: true
      }),

      // 키보드 이벤트
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      }),

      new KeyboardEvent('keyup', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      }),

      // 변경 이벤트
      new Event('change', { bubbles: true, cancelable: true }),

      // 커스텀 이벤트 (YouTube가 사용할 수 있는)
      new CustomEvent('textchange', { bubbles: true, cancelable: true })
    ];

    events.forEach((event, index) => {
      setTimeout(() => {
        element.dispatchEvent(event);
        console.log(`Triggered event ${index + 1}/${events.length}:`, event.type);
      }, index * 50);
    });
  }

  async clickCommentSubmitButton() {
    // 실제 YouTube DOM 구조 기반 버튼 selector들 (2025년 1월 기준)
    const submitSelectors = [
      // 가장 정확한 selector - 실제 DOM 구조 기반
      'ytd-commentbox ytd-button-renderer#submit-button button',
      'ytd-button-renderer#submit-button yt-button-shape button',
      'ytd-commentbox #submit-button button',

      // ID 기반 (가장 안정적)
      '#submit-button button',
      'ytd-button-renderer#submit-button button',

      // 실제 DOM 경로 기반
      'ytd-commentbox #footer #buttons ytd-button-renderer#submit-button button',
      'ytd-commentbox #buttons ytd-button-renderer#submit-button button',
      '#buttons ytd-button-renderer#submit-button button',

      // aria-label 기반 (한국어/영어)
      'ytd-commentbox button[aria-label*="댓글"]',
      'ytd-commentbox button[aria-label*="Comment"]',
      'button[aria-label="댓글"]',
      'button[aria-label="Comment"]',

      // 클래스 기반
      'button.yt-spec-button-shape-next--filled:not([disabled])',
      'ytd-commentbox button.yt-spec-button-shape-next--filled',

      // 특정 클래스 조합 (실제 DOM에서 관찰된 패턴)
      'ytd-commentbox .yt-spec-button-shape-next--filled button',
      'ytd-commentbox yt-button-shape button',

      // 폴백 selector들
      'ytd-commentbox ytd-button-renderer button:not([disabled])',
      'ytd-comment-simplebox-renderer ytd-button-renderer button',

      // 댓글 영역 내의 활성 버튼들
      '#comments ytd-button-renderer button:not([disabled])',
      'ytd-comments ytd-button-renderer button:not([disabled])',

      // 최후의 수단 - 댓글 영역의 모든 버튼
      'ytd-commentbox button:not([disabled])',
      '#comments button:not([disabled])'
    ];

    console.log('Searching for comment submit button with', submitSelectors.length, 'selectors');

    for (const selector of submitSelectors) {
      const buttons = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${buttons.length} buttons`);

      for (const button of buttons) {
        console.log('Checking button:', {
          selector,
          tagName: button.tagName,
          textContent: button.textContent?.trim(),
          ariaLabel: button.getAttribute('aria-label'),
          disabled: button.disabled,
          isVisible: button.offsetParent !== null,
          isSubmitButton: this.isCommentSubmitButton(button)
        });

        if (this.isCommentSubmitButton(button)) {
          console.log('Found comment submit button:', selector, button);
          button.click();
          return;
        }
      }
    }

    console.log('No comment submit button found after checking all selectors');
    throw new Error('댓글 제출 버튼을 찾을 수 없습니다. 댓글 섹션으로 스크롤해주세요.');
  }

  isCommentSubmitButton(button) {
    // 실제 YouTube DOM 구조 기반 검증 로직
    if (!button || button.disabled) return false;

    const text = (button.textContent || button.innerText || '').trim();
    const ariaLabel = button.getAttribute('aria-label') || '';
    const className = button.className || '';

    // 1. 가시성 및 클릭 가능성 확인
    const isClickable = button.offsetParent !== null &&
                        button.offsetWidth > 0 &&
                        button.offsetHeight > 0 &&
                        !button.hidden &&
                        button.style.display !== 'none';
    if (!isClickable) return false;

    // 2. ytd-commentbox 내부에 있는지 확인 (실제 DOM 구조 기반)
    const isInCommentBox = button.closest('ytd-commentbox') ||
                          button.closest('ytd-comment-simplebox-renderer') ||
                          button.closest('#comments');

    if (!isInCommentBox) return false;

    // 3. submit-button ID가 있는 ytd-button-renderer 내부인지 확인
    const submitButtonRenderer = button.closest('ytd-button-renderer#submit-button');
    if (submitButtonRenderer) return true;

    // 4. 댓글 제출 관련 텍스트나 aria-label 확인
    const submitKeywords = ['댓글', 'comment'];
    const hasSubmitKeyword = submitKeywords.some(keyword =>
      text.toLowerCase().includes(keyword.toLowerCase()) ||
      ariaLabel.toLowerCase().includes(keyword.toLowerCase())
    );

    // 5. 실제 DOM에서 관찰된 클래스 패턴 확인
    const hasSubmitButtonClass = className.includes('yt-spec-button-shape-next--filled') ||
                                 button.closest('.yt-spec-button-shape-next--filled');

    // 6. #buttons 영역 내부에 있는지 확인
    const isInButtonsArea = button.closest('#buttons');

    // 모든 조건을 종합하여 판단
    return isInCommentBox && (submitButtonRenderer || (hasSubmitKeyword && (hasSubmitButtonClass || isInButtonsArea)));
  }

  async scrollToCommentsSection() {
    // 댓글 섹션을 찾아서 스크롤
    const commentSelectors = [
      '#comments',
      'ytd-comments',
      '#contents.ytd-item-section-renderer',
      'ytd-comments-header-renderer'
    ];

    for (const selector of commentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('Scrolling to comments section:', selector);
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
        return;
      }
    }

    // 댓글 섹션을 찾지 못한 경우 페이지 하단으로 스크롤
    console.log('Comments section not found, scrolling to bottom');
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
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