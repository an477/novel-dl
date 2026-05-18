async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 보안 세션 유지를 위해 실제 팝업 창 오픈
        const popup = window.open(url, '_blank', 'width=800,height=600,noopener=false,noreferrer=false');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups for this site to download.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 50; // 최대 10초 대기
        
        const timer = setInterval(() => {
            checkAttempts++;
            try {
                const popupDoc = popup.document;
                
                // "불러오는 중..." 문구가 완전히 사라지고 화면에 글자가 풀렸을 때 작동
                if (popupDoc && popupDoc.body && !popupDoc.body.innerText.includes("불러오는 중") && popupDoc.body.innerText.length > 300) {
                    clearInterval(timer);
                    
                    // 에피소드 제목 추출
                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) {
                        episodeTitle = numElem.textContent.trim();
                    }

                    // 2. [보안 돌파 핵심] 복사 방지/전체선택 차단 엔진을 완전히 우회하는 기믹
                    // 브라우저 렌더링 트리에서 순수 '텍스트 노드'만 추적하여 배열에 담아 합칩니다.
                    // 이 방식은 드래그나 Selection 명령을 쓰지 않으므로 차단 스크립트가 감지할 수 없습니다.
                    const textNodes = [];
                    const walk = popupDoc.createTreeWalker(popupDoc.body, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while (node = walk.nextNode()) {
                        const trimmed = node.nodeValue.trim();
                        // 공백이 아니고, 스크립트 소스코드가 아닌 순수 화면 노출 텍스트만 선별
                        if (trimmed && !node.parentNode.matches('script, style, noscript, button')) {
                            textNodes.push(node.nodeValue);
                        }
                    }
                    
                    // 전체 선택(Ctrl+A)해서 긁어온 것과 완벽히 동일한 원본 문자열 스트림 조립
                    const combinedRawText = textNodes.join('\n');

                    // 수집 끝났으므로 팝업 창 종료
                    popup.close();

                    // 3. [요청하신 상하단 잘라내기 가공 처리]
                    let cleanedContent = '';
                    
                    // "16px\n+\n기본" 등 툴바 문자열 위치 매칭용 유연한 정규식
                    const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                    const topMatch = combinedRawText.match(topMarkerRegex);

                    if (topMatch) {
                        // "기본" 위쪽 영역(상단 메뉴 등) 가차없이 삭제
                        const upperSliced = combinedRawText.substring(topMatch.index + topMatch[0].length).trim();
                        
                        // 하단 뷰어 내비게이션 바인 "‹ 이전화" 또는 "목록" 위치 추적
                        let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                        if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                            bottomIndex = upperSliced.lastIndexOf("목록");
                        }
                        
                        // 찾았다면 하단 댓글/목록 메뉴 영역 미련 없이 삭제
                        if (bottomIndex !== -1 && bottomIndex > 50) {
                            cleanedContent = upperSliced.substring(0, bottomIndex).trim();
                        } else {
                            cleanedContent = upperSliced;
                        }
                    } else {
                        // 기준점 매칭 실패 시 수집된 전체 텍스트 보존 처리
                        cleanedContent = combinedRawText;
                    }

                    // 줄바꿈 정돈 규칙 적용 후 반환
                    cleanedContent = cleanText(cleanedContent);
                    if (cleanedContent.startsWith(episodeTitle)) {
                        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
                    }

                    resolve({
                        episodeTitle: episodeTitle,
                        content: cleanedContent
                    });
                }
            } catch (e) {
                // 로딩 찰나의 순간 도메인 예외 에러 무시
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for memory text tree extraction on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200);
    });
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };
    Object.entries(entities).forEach(([entity, replacement]) => {
        text = text.replace(new RegExp(entity, 'g'), replacement);
    });
    return text;
}

function cleanText(text) {
    text = unescapeHTML(text);
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');
}

// ... 이하 createModal, downloadNovel, runCrawler 등 기존 UI 제어 코드 결합 구동
