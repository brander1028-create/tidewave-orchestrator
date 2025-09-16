import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Hash, Target, Archive, Settings } from "lucide-react";

export default function DatabasePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">데이터베이스</h1>
          <p className="text-muted-foreground mt-1">키워드, 타겟, 스냅샷 관리 및 수집 규칙 설정</p>
        </div>
        <Badge variant="outline" className="text-purple-600">
          <Database className="w-4 h-4 mr-1" />
          DB 관리
        </Badge>
      </div>

      <Tabs defaultValue="keywords" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Hash className="w-4 h-4" />
            키워드 보관소
          </TabsTrigger>
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            타겟 관리
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            스냅샷 요약
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            수집 규칙
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>키워드 보관소</CardTitle>
              <p className="text-sm text-muted-foreground">
                수집된 키워드 [조회량] [점수] 관리 및 상태 제어
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                키워드별 조회량, 점수, 수집 상태를 관리하고 그룹에 추가할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>타겟 관리</CardTitle>
              <p className="text-sm text-muted-foreground">
                블로그/상품 타겟의 스케줄 및 상태 관리
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                추적 중인 타겟의 상태를 모니터링하고 즉시 체크하거나 중지/재개할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>스냅샷 요약</CardTitle>
              <p className="text-sm text-muted-foreground">
                일별 집계 데이터 및 보관 정책 관리 (최근 180일)
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                순위 변동 히스토리와 집계 통계를 확인하고 보관 정책을 설정할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>수집 규칙 / 비용 가드</CardTitle>
              <p className="text-sm text-muted-foreground">
                자동 중지 규칙, 토큰 사용량 추정, 캐시 설정
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">💰 비용 가드 활성화</h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    키워드×타겟이 최근 30일간 Top 페이지 미진입 시 자동 수집 중지
                  </p>
                </div>
                <p className="text-muted-foreground">
                  토큰 사용량 모니터링, 캐시 히트율 확인, 429 에러 비율 추적이 가능합니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}