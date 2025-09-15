import { 
  type ProfitabilityAnalysis, 
  type InsertProfitabilityAnalysis,
  type ListingOptimization, 
  type InsertListingOptimization,
  profitabilityAnalysis,
  listingOptimization
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface ProfitabilityCalculatorInput {
  productKey: string;
  productCost: number;
  shippingCost: number;
  advertisingCost?: number;
  platformFee?: number;
  otherCosts?: number;
  sellingPrice: number;
  avgDailySales: number;
  conversionRate?: number;
}

export interface OptimizationRecommendation {
  category: string;
  priority: 'high' | 'medium' | 'low';
  issue: string;
  suggestion: string;
  potentialImpact: string;
}

export interface ListingOptimizationInput {
  productKey: string;
  title: string;
  description: string;
  images: Array<{ url: string; quality: number }>;
  price: number;
  competitorPrices: number[];
  reviews: Array<{ rating: number; content: string }>;
  category: string;
  attributes: Record<string, any>;
}

export class ProfitabilityService {
  
  async calculateProfitability(input: ProfitabilityCalculatorInput): Promise<ProfitabilityAnalysis> {
    const {
      productKey,
      productCost,
      shippingCost,
      advertisingCost = 0,
      platformFee = 0,
      otherCosts = 0,
      sellingPrice,
      avgDailySales,
      conversionRate = 0.02
    } = input;

    // 총 비용 계산
    const totalCosts = productCost + shippingCost + advertisingCost + platformFee + otherCosts;
    
    // 수익성 지표 계산
    const grossProfit = sellingPrice - totalCosts;
    const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) : 0;
    const roi = totalCosts > 0 ? (grossProfit / totalCosts) : 0;
    const breakEvenPoint = grossProfit > 0 ? Math.ceil(totalCosts / grossProfit) : 0;

    // 최적화 점수 계산 (0-100)
    const optimizationScore = this.calculateOptimizationScore({
      grossMargin,
      roi,
      avgDailySales,
      conversionRate
    });

    // 추천사항 생성
    const recommendations = this.generateProfitabilityRecommendations({
      grossMargin,
      roi,
      avgDailySales,
      conversionRate,
      advertisingCost,
      productCost,
      sellingPrice
    });

    // 경쟁력 점수 계산
    const competitivenessScore = this.calculateCompetitivenessScore({
      grossMargin,
      roi,
      avgDailySales
    });

    const marketPosition = this.determineMarketPosition(competitivenessScore);

    const analysisData: InsertProfitabilityAnalysis = {
      productKey,
      productCost: productCost.toString(),
      shippingCost: shippingCost.toString(),
      advertisingCost: advertisingCost.toString(),
      platformFee: platformFee.toString(),
      otherCosts: otherCosts.toString(),
      sellingPrice: sellingPrice.toString(),
      avgDailySales,
      conversionRate: conversionRate.toString(),
      grossProfit: grossProfit.toString(),
      grossMargin: grossMargin.toString(),
      roi: roi.toString(),
      breakEvenPoint,
      optimizationScore,
      recommendations,
      competitivenessScore,
      marketPosition
    };

    // 데이터베이스에 저장
    const [result] = await db.insert(profitabilityAnalysis)
      .values(analysisData)
      .returning();

    return result;
  }

  async analyzeListing(input: ListingOptimizationInput): Promise<ListingOptimization> {
    const {
      productKey,
      title,
      description,
      images,
      price,
      competitorPrices,
      reviews,
      category,
      attributes
    } = input;

    // SEO 최적화 점수 계산
    const titleScore = this.analyzeTitleOptimization(title);
    const descriptionScore = this.analyzeDescriptionOptimization(description);
    const keywordDensity = this.calculateKeywordDensity(title, description);

    // 이미지 최적화 분석
    const imageCount = images.length;
    const imageQualityScore = this.calculateImageQualityScore(images);
    const hasLifestyleImages = this.checkLifestyleImages(images);

    // 가격 경쟁력 분석
    const priceCompetitiveness = this.analyzePriceCompetitiveness(price, competitorPrices);
    const pricePosition = this.determinePricePosition(price, competitorPrices);

    // 리뷰 최적화 분석
    const reviewOptimization = this.analyzeReviewOptimization(reviews);
    const avgRating = reviews.length > 0 
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length 
      : 0;
    const reviewCount = reviews.length;

    // 카테고리 및 속성 최적화
    const categoryAccuracy = this.analyzeCategoryAccuracy(category, title, description);
    const attributeCompleteness = this.analyzeAttributeCompleteness(attributes);

    // 전체 최적화 점수 계산
    const overallScore = this.calculateOverallOptimizationScore({
      titleScore,
      descriptionScore,
      imageQualityScore,
      priceCompetitiveness,
      reviewOptimization,
      categoryAccuracy,
      attributeCompleteness
    });

    const grade = this.determineOptimizationGrade(overallScore);

    // 개선 제안 생성
    const improvements = this.generateListingImprovements({
      titleScore,
      descriptionScore,
      imageCount,
      imageQualityScore,
      hasLifestyleImages,
      priceCompetitiveness,
      reviewCount,
      avgRating,
      categoryAccuracy,
      attributeCompleteness
    });

    const optimizationData: InsertListingOptimization = {
      productKey,
      titleScore,
      descriptionScore,
      keywordDensity: keywordDensity.toString(),
      imageCount,
      imageQualityScore,
      hasLifestyleImages,
      priceCompetitiveness,
      pricePosition,
      reviewOptimization,
      avgRating: avgRating.toString(),
      reviewCount,
      categoryAccuracy,
      attributeCompleteness,
      overallScore,
      grade,
      improvements
    };

    // 데이터베이스에 저장
    const [result] = await db.insert(listingOptimization)
      .values(optimizationData)
      .returning();

    return result;
  }

  private calculateOptimizationScore(metrics: {
    grossMargin: number;
    roi: number;
    avgDailySales: number;
    conversionRate: number;
  }): number {
    const { grossMargin, roi, avgDailySales, conversionRate } = metrics;
    
    let score = 0;
    
    // 마진 점수 (40점 만점)
    if (grossMargin >= 0.3) score += 40;
    else if (grossMargin >= 0.2) score += 30;
    else if (grossMargin >= 0.15) score += 20;
    else if (grossMargin >= 0.1) score += 10;
    
    // ROI 점수 (30점 만점)
    if (roi >= 1.0) score += 30;
    else if (roi >= 0.5) score += 20;
    else if (roi >= 0.3) score += 15;
    else if (roi >= 0.1) score += 10;
    
    // 판매량 점수 (20점 만점)
    if (avgDailySales >= 50) score += 20;
    else if (avgDailySales >= 20) score += 15;
    else if (avgDailySales >= 10) score += 10;
    else if (avgDailySales >= 5) score += 5;
    
    // 전환율 점수 (10점 만점)
    if (conversionRate >= 0.05) score += 10;
    else if (conversionRate >= 0.03) score += 7;
    else if (conversionRate >= 0.02) score += 5;
    else if (conversionRate >= 0.01) score += 3;
    
    return Math.min(score, 100);
  }

  private generateProfitabilityRecommendations(metrics: {
    grossMargin: number;
    roi: number;
    avgDailySales: number;
    conversionRate: number;
    advertisingCost: number;
    productCost: number;
    sellingPrice: number;
  }): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    
    if (metrics.grossMargin < 0.2) {
      recommendations.push({
        category: "마진 개선",
        priority: "high",
        issue: "낮은 수익 마진",
        suggestion: "제품 원가 절감 또는 판매가 인상 검토",
        potentialImpact: "마진 5-10% 개선 가능"
      });
    }
    
    if (metrics.roi < 0.3) {
      recommendations.push({
        category: "ROI 최적화",
        priority: "high",
        issue: "낮은 투자 수익률",
        suggestion: "광고비 효율성 개선 또는 운영비용 절감",
        potentialImpact: "ROI 20-30% 개선 가능"
      });
    }
    
    if (metrics.avgDailySales < 10) {
      recommendations.push({
        category: "판매량 증대",
        priority: "medium",
        issue: "낮은 일일 판매량",
        suggestion: "마케팅 강화 또는 가격 전략 재검토",
        potentialImpact: "판매량 50-100% 증가 가능"
      });
    }
    
    if (metrics.conversionRate < 0.02) {
      recommendations.push({
        category: "전환율 개선",
        priority: "medium",
        issue: "낮은 전환율",
        suggestion: "상품 상세페이지 최적화 또는 고객 리뷰 관리",
        potentialImpact: "전환율 30-50% 개선 가능"
      });
    }
    
    return recommendations;
  }

  private calculateCompetitivenessScore(metrics: {
    grossMargin: number;
    roi: number;
    avgDailySales: number;
  }): number {
    const { grossMargin, roi, avgDailySales } = metrics;
    
    let score = 0;
    
    // 각 지표별 점수 계산
    score += grossMargin >= 0.25 ? 35 : grossMargin >= 0.15 ? 25 : 15;
    score += roi >= 0.5 ? 35 : roi >= 0.3 ? 25 : 15;
    score += avgDailySales >= 30 ? 30 : avgDailySales >= 15 ? 20 : 10;
    
    return Math.min(score, 100);
  }

  private determineMarketPosition(score: number): string {
    if (score >= 80) return "선도적";
    if (score >= 60) return "경쟁력 있음";
    if (score >= 40) return "평균적";
    return "개선 필요";
  }

  // 리스팅 최적화 관련 메서드들
  private analyzeTitleOptimization(title: string): number {
    let score = 0;
    
    // 제목 길이 체크
    if (title.length >= 10 && title.length <= 50) score += 25;
    else if (title.length >= 5) score += 15;
    
    // 키워드 포함 체크 (간단한 휴리스틱)
    const keywords = ["홍삼", "효능", "추천", "최고", "프리미엄"];
    const foundKeywords = keywords.filter(keyword => title.includes(keyword));
    score += foundKeywords.length * 15;
    
    // 특수문자 적절성
    if (title.includes("★") || title.includes("♥")) score += 10;
    
    return Math.min(score, 100);
  }

  private analyzeDescriptionOptimization(description: string): number {
    let score = 0;
    
    if (description.length >= 100) score += 30;
    if (description.includes("효능") || description.includes("특징")) score += 20;
    if (description.includes("사용법") || description.includes("복용법")) score += 20;
    if (description.includes("성분") || description.includes("원료")) score += 15;
    if (description.includes("품질보증") || description.includes("안전")) score += 15;
    
    return Math.min(score, 100);
  }

  private calculateKeywordDensity(title: string, description: string): number {
    const text = (title + " " + description).toLowerCase();
    const keywords = ["홍삼", "건강", "효능"];
    let keywordCount = 0;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, "g");
      const matches = text.match(regex);
      if (matches) keywordCount += matches.length;
    });
    
    const totalWords = text.split(/\s+/).length;
    return totalWords > 0 ? (keywordCount / totalWords) * 100 : 0;
  }

  private calculateImageQualityScore(images: Array<{ url: string; quality: number }>): number {
    if (images.length === 0) return 0;
    
    const avgQuality = images.reduce((sum, img) => sum + img.quality, 0) / images.length;
    return Math.round(avgQuality);
  }

  private checkLifestyleImages(images: Array<{ url: string; quality: number }>): boolean {
    // 간단한 휴리스틱 - 실제로는 이미지 분석 AI 필요
    return images.length >= 3;
  }

  private analyzePriceCompetitiveness(price: number, competitorPrices: number[]): number {
    if (competitorPrices.length === 0) return 50; // 중간 점수
    
    const avgCompetitorPrice = competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;
    const priceDiff = (price - avgCompetitorPrice) / avgCompetitorPrice;
    
    if (priceDiff <= -0.1) return 90; // 10% 이상 저렴
    if (priceDiff <= 0) return 80;    // 평균 이하
    if (priceDiff <= 0.1) return 60;  // 10% 이내 비쌈
    return 30; // 10% 이상 비쌈
  }

  private determinePricePosition(price: number, competitorPrices: number[]): string {
    if (competitorPrices.length === 0) return "competitive";
    
    const minPrice = Math.min(...competitorPrices);
    const avgPrice = competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;
    const maxPrice = Math.max(...competitorPrices);
    
    if (price <= minPrice) return "lowest";
    if (price <= avgPrice) return "competitive";
    if (price <= maxPrice * 1.2) return "premium";
    return "overpriced";
  }

  private analyzeReviewOptimization(reviews: Array<{ rating: number; content: string }>): number {
    if (reviews.length === 0) return 0;
    
    const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    const reviewCount = reviews.length;
    
    let score = 0;
    
    // 평균 평점 점수
    score += avgRating >= 4.5 ? 40 : avgRating >= 4.0 ? 30 : avgRating >= 3.5 ? 20 : 10;
    
    // 리뷰 수 점수
    score += reviewCount >= 100 ? 30 : reviewCount >= 50 ? 25 : reviewCount >= 20 ? 20 : 10;
    
    // 리뷰 내용 품질 (간단한 휴리스틱)
    const qualityReviews = reviews.filter(r => r.content.length > 20).length;
    const qualityRatio = qualityReviews / reviews.length;
    score += qualityRatio >= 0.7 ? 30 : qualityRatio >= 0.5 ? 20 : 10;
    
    return Math.min(score, 100);
  }

  private analyzeCategoryAccuracy(category: string, title: string, description: string): number {
    // 간단한 카테고리 일치도 체크
    const text = (title + " " + description).toLowerCase();
    const categoryLower = category.toLowerCase();
    
    if (text.includes(categoryLower)) return 90;
    
    // 관련 키워드 체크
    const healthKeywords = ["건강", "영양", "보충제", "홍삼"];
    if (category.includes("건강") && healthKeywords.some(keyword => text.includes(keyword))) {
      return 80;
    }
    
    return 50; // 기본 점수
  }

  private analyzeAttributeCompleteness(attributes: Record<string, any>): number {
    const totalAttributes = Object.keys(attributes).length;
    const filledAttributes = Object.values(attributes).filter(value => 
      value !== null && value !== undefined && value !== ""
    ).length;
    
    if (totalAttributes === 0) return 50;
    
    const completeness = filledAttributes / totalAttributes;
    return Math.round(completeness * 100);
  }

  private calculateOverallOptimizationScore(scores: {
    titleScore: number;
    descriptionScore: number;
    imageQualityScore: number;
    priceCompetitiveness: number;
    reviewOptimization: number;
    categoryAccuracy: number;
    attributeCompleteness: number;
  }): number {
    const weights = {
      titleScore: 0.2,
      descriptionScore: 0.15,
      imageQualityScore: 0.15,
      priceCompetitiveness: 0.2,
      reviewOptimization: 0.15,
      categoryAccuracy: 0.1,
      attributeCompleteness: 0.05
    };
    
    let weightedSum = 0;
    for (const [key, weight] of Object.entries(weights)) {
      weightedSum += scores[key as keyof typeof scores] * weight;
    }
    
    return Math.round(weightedSum);
  }

  private determineOptimizationGrade(score: number): string {
    if (score >= 95) return "A+";
    if (score >= 90) return "A";
    if (score >= 85) return "B+";
    if (score >= 80) return "B";
    if (score >= 75) return "C+";
    if (score >= 70) return "C";
    return "D";
  }

  private generateListingImprovements(analysis: {
    titleScore: number;
    descriptionScore: number;
    imageCount: number;
    imageQualityScore: number;
    hasLifestyleImages: boolean;
    priceCompetitiveness: number;
    reviewCount: number;
    avgRating: number;
    categoryAccuracy: number;
    attributeCompleteness: number;
  }): OptimizationRecommendation[] {
    const improvements: OptimizationRecommendation[] = [];
    
    if (analysis.titleScore < 70) {
      improvements.push({
        category: "제목 최적화",
        priority: "high",
        issue: "제목에 핵심 키워드 부족",
        suggestion: "주요 키워드를 포함한 매력적인 제목으로 수정",
        potentialImpact: "검색 노출 20-30% 증가"
      });
    }
    
    if (analysis.imageCount < 5) {
      improvements.push({
        category: "이미지 최적화",
        priority: "medium",
        issue: "상품 이미지 수 부족",
        suggestion: "다양한 각도의 고품질 이미지 추가 (최소 5개)",
        potentialImpact: "전환율 15-25% 개선"
      });
    }
    
    if (analysis.reviewCount < 20) {
      improvements.push({
        category: "리뷰 관리",
        priority: "medium",
        issue: "리뷰 수 부족",
        suggestion: "구매 후 리뷰 작성 유도 캠페인 실시",
        potentialImpact: "신뢰도 및 전환율 10-20% 증가"
      });
    }
    
    if (analysis.priceCompetitiveness < 60) {
      improvements.push({
        category: "가격 전략",
        priority: "high",
        issue: "경쟁력 없는 가격",
        suggestion: "경쟁사 가격 분석 후 가격 조정 검토",
        potentialImpact: "판매량 30-50% 증가 가능"
      });
    }
    
    return improvements;
  }

  // 데이터 조회 메서드들
  async getProfitabilityAnalysis(productKey: string): Promise<ProfitabilityAnalysis | null> {
    const [result] = await db.select()
      .from(profitabilityAnalysis)
      .where(eq(profitabilityAnalysis.productKey, productKey))
      .orderBy(desc(profitabilityAnalysis.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getListingOptimization(productKey: string): Promise<ListingOptimization | null> {
    const [result] = await db.select()
      .from(listingOptimization)
      .where(eq(listingOptimization.productKey, productKey))
      .orderBy(desc(listingOptimization.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getAllProfitabilityAnalyses(): Promise<ProfitabilityAnalysis[]> {
    return await db.select()
      .from(profitabilityAnalysis)
      .orderBy(desc(profitabilityAnalysis.timestamp));
  }

  async getAllListingOptimizations(): Promise<ListingOptimization[]> {
    return await db.select()
      .from(listingOptimization)
      .orderBy(desc(listingOptimization.timestamp));
  }
}

// Singleton instance
export const profitabilityService = new ProfitabilityService();