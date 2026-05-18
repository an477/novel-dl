async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        const popup = window.open(url, '_blank', 'width=800,height=600');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 50; 
        
        const timer = setInterval(async () => {
            checkAttempts++;
            try {
                const popupDoc = popup.document;
                const popupWin = popup.window;
                
                // 섀도 돔 호스트 엘리먼트와 본문 로딩 상태 감시
                const shadowHost = popupDoc.querySelector('.novel-viewer div[style*="font-size"]');
                if (shadowHost && !popupDoc.body.innerText.includes("불러오는 중")) {
                    clearInterval(timer);

                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) episodeTitle = numElem.textContent.trim();

                    // [핵심 우회 가이드] 팝업창 내부에 임시로 붙여넣기용 포커스 엘리먼트를 심습니다.
                    // 부모가 섀도 돔을 읽는 대신, 자식 창 자체에서 전체 선택(Selection)을 수행합니다.
                    const range = popupDoc.createRange();
                    range.selectNodeContents(popupDoc.body);
                    const selection = popupWin.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);

                    // 자식 창 내에서 가상 복사 명령 전달 -> 브라우저가 closed 장벽 안의 텍스트를 평문으로 복사해 줍니다.
                    let grabbedRawText = selection.toString();
                    
                    // 만약 Selection이 차단되었다면 임시 textarea를 통한 클립보드 강제 가로채기 시도
                    if (!grabbedRawText || grabbedRawText.length < 100) {
                        popupWin.focus();
                        popupDoc.execCommand('selectAll', false, null);
                        grabbedRawText = popupWin.getSelection().toString();
                    }

                    selection.removeAllRanges();
                    popup.close();

                    // [텍스트 컷팅 처리] "16px + 기본" 위쪽 제거, "목록 / 이전화" 아래쪽 제거
                    let cleanedContent = grabbedRawText;
                    const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                    const topMatch = cleanedContent.match(topMarkerRegex);

                    if (topMatch) {
                        const upperSliced = cleanedContent.substring(topMatch.index + topMatch[0].length).trim();
                        let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                        if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                            bottomIndex = upperSliced.lastIndexOf("목록");
                        }
                        if (bottomIndex !== -1 && bottomIndex > 30) {
                            cleanedContent = upperSliced.substring(0, bottomIndex).trim();
                        } else {
                            cleanedContent = upperSliced;
                        }
                    }

                    cleanedContent = cleanText(cleanedContent);
                    if (cleanedContent.startsWith(episodeTitle)) {
                        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
                    }

                    resolve({ episodeTitle, content: cleanedContent });
                }
            } catch (e) {
                // 로딩 중 크로스 도메인 예외 무시
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200);
    });
}
