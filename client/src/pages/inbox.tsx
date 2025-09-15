import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Inbox as InboxIcon, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  FileText,
  ShoppingBag,
  Hash,
  Calendar,
  Eye
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import type { Submission } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SubmissionWithActions extends Submission {
  actions?: React.ReactNode;
}

export default function Inbox() {
  const [selectedTab, setSelectedTab] = React.useState("pending");
  const [selectedSubmission, setSelectedSubmission] = React.useState<Submission | null>(null);
  const [reviewComment, setReviewComment] = React.useState("");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = React.useState(false);
  const [reviewAction, setReviewAction] = React.useState<"approve" | "reject">("approve");

  const queryClient = useQueryClient();

  // Fetch submissions
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["/api/mock/submissions", selectedTab !== "all" ? selectedTab : undefined],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Mutation for approving/rejecting submissions
  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, comment }: { id: string; action: string; comment?: string }) => {
      return await apiRequest("POST", `/api/mock/submissions/${id}/${action}`, { comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mock/submissions"] });
      toast({
        title: reviewAction === "approve" ? "승인 완료" : "반려 완료",
        description: `제출 항목이 ${reviewAction === "approve" ? "승인" : "반려"}되었습니다.`,
      });
      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      setReviewComment("");
    },
    onError: (error) => {
      toast({
        title: "오류",
        description: "처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const openReviewDialog = (submission: Submission, action: "approve" | "reject") => {
    setSelectedSubmission(submission);
    setReviewAction(action);
    setIsReviewDialogOpen(true);
  };

  const handleReview = () => {
    if (!selectedSubmission) return;
    
    reviewMutation.mutate({
      id: selectedSubmission.id,
      action: reviewAction,
      comment: reviewComment.trim() || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">대기중</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-500 border-green-500">승인됨</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-red-500 border-red-500">반려됨</Badge>;
      default:
        return <Badge variant="outline">알 수 없음</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "blog":
        return <FileText className="w-4 h-4" />;
      case "product":
        return <ShoppingBag className="w-4 h-4" />;
      case "keyword":
        return <Hash className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case "blog":
        return "블로그";
      case "product":
        return "상품";
      case "keyword":
        return "키워드";
      default:
        return type;
    }
  };

  const columns: ColumnDef<SubmissionWithActions>[] = [
    {
      accessorKey: "type",
      header: "유형",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {getTypeIcon(row.original.type)}
          <span className="text-sm font-medium">{getTypeName(row.original.type)}</span>
        </div>
      ),
    },
    {
      accessorKey: "payload",
      header: "내용",
      cell: ({ row }) => {
        const payload = row.original.payload as any;
        let displayText = "";
        
        if (row.original.type === "keyword") {
          displayText = payload.keyword || "키워드 정보 없음";
        } else if (row.original.type === "blog") {
          displayText = payload.url || "URL 정보 없음";
        } else if (row.original.type === "product") {
          displayText = payload.name || payload.productKey || "상품 정보 없음";
        } else {
          displayText = JSON.stringify(payload).substring(0, 50) + "...";
        }
        
        return (
          <div className="max-w-xs">
            <div className="text-sm font-medium text-foreground truncate">{displayText}</div>
            {payload.description && (
              <div className="text-xs text-muted-foreground truncate">{payload.description}</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "owner",
      header: "제출자",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.owner}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "상태",
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: "timestamp",
      header: "제출일시",
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          <div>{new Date(row.original.timestamp).toLocaleDateString('ko-KR')}</div>
          <div>{new Date(row.original.timestamp).toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}</div>
        </div>
      ),
    },
    {
      id: "actions",
      header: "액션",
      cell: ({ row }) => {
        if (row.original.status !== "pending") {
          return (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0"
              onClick={() => setSelectedSubmission(row.original)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          );
        }
        
        return (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-green-600 border-green-600 hover:bg-green-600 hover:text-white"
              onClick={() => openReviewDialog(row.original, "approve")}
              data-testid={`button-approve-${row.original.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              승인
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
              onClick={() => openReviewDialog(row.original, "reject")}
              data-testid={`button-reject-${row.original.id}`}
            >
              <XCircle className="w-4 h-4 mr-1" />
              반려
            </Button>
          </div>
        );
      },
    },
  ];

  // Filter submissions for "new" tab (last 24 hours)
  const newSubmissions = submissions.filter((submission: Submission) => {
    const submissionDate = new Date(submission.timestamp);
    const now = new Date();
    const timeDiff = now.getTime() - submissionDate.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    return hoursDiff <= 24;
  });

  const getTabData = () => {
    switch (selectedTab) {
      case "pending":
        return submissions.filter((s: Submission) => s.status === "pending");
      case "approved":
        return submissions.filter((s: Submission) => s.status === "approved");
      case "rejected":
        return submissions.filter((s: Submission) => s.status === "rejected");
      case "new":
        return newSubmissions;
      default:
        return submissions;
    }
  };

  const pendingCount = submissions.filter((s: Submission) => s.status === "pending").length;
  const newCount = newSubmissions.length;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              대기중
            </CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">승인 대기중인 항목</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              신규 (24h)
            </CardTitle>
            <Calendar className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{newCount}</div>
            <p className="text-xs text-muted-foreground">최근 24시간 제출</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              승인됨
            </CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {submissions.filter((s: Submission) => s.status === "approved").length}
            </div>
            <p className="text-xs text-muted-foreground">승인 완료</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              반려됨
            </CardTitle>
            <XCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {submissions.filter((s: Submission) => s.status === "rejected").length}
            </div>
            <p className="text-xs text-muted-foreground">반려됨</p>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Table with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            제출함 관리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="pending" className="relative" data-testid="tab-pending">
                대기중
                {pendingCount > 0 && (
                  <Badge className="ml-2 bg-yellow-500">{pendingCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="new" className="relative" data-testid="tab-new">
                신규 (24h)
                {newCount > 0 && (
                  <Badge className="ml-2 bg-blue-500">{newCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved">승인됨</TabsTrigger>
              <TabsTrigger value="rejected" data-testid="tab-rejected">반려됨</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">전체</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedTab} className="mt-6">
              <DataTable
                columns={columns}
                data={getTabData()}
                searchPlaceholder="제출 항목 검색..."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "승인" : "반려"} - {selectedSubmission?.type && getTypeName(selectedSubmission.type)}
            </DialogTitle>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">제출 내용</h4>
                <div className="p-3 bg-secondary rounded-lg">
                  <pre className="text-sm text-foreground whitespace-pre-wrap">
                    {JSON.stringify(selectedSubmission.payload, null, 2)}
                  </pre>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">제출자</h4>
                <p className="text-sm text-muted-foreground">{selectedSubmission.owner}</p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  {reviewAction === "approve" ? "승인" : "반려"} 사유 (선택사항)
                </h4>
                <Textarea
                  placeholder={`${reviewAction === "approve" ? "승인" : "반려"} 사유를 입력하세요...`}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  data-testid="textarea-review-comment"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewMutation.isPending}
              className={reviewAction === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "처리중..." : (reviewAction === "approve" ? "승인" : "반려")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
